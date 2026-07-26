/**
 * The export render worker (M11), running in-process with the API.
 *
 * Design: the `exports` table IS the queue (spec §2 — services communicate
 * through the DB only). The worker claims one queued row at a time with
 * FOR UPDATE SKIP LOCKED (safe if the service ever scales to replicas),
 * renders it with Remotion + headless Chrome, and writes the encoded bytes
 * back onto the row. Rendering is strictly one-at-a-time per process —
 * renderMedia already parallelizes across frames internally, and Railway
 * containers don't have memory for two Chromes.
 *
 * The webpack bundle of src/render/composition is built lazily on the first
 * claimed job and cached for the process lifetime, so API cold-start pays
 * nothing for the renderer.
 */
import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { exports as exportsTable, scenes } from "@/lib/db/schema";

const POLL_MS = 3000;
/** Refuse to store files beyond this — a runaway GIF must not bloat the DB. */
const MAX_FILE_BYTES = 60 * 1024 * 1024;

type Format = "mp4" | "webm" | "gif" | "mov";
type Quality = "fast" | "balanced" | "high";

const CODEC: Record<Format, "h264" | "vp8" | "gif" | "prores"> = {
  mp4: "h264",
  webm: "vp8",
  gif: "gif",
  mov: "prores",
};

/** Quality knobs: output scale (canvas is 1920x1080) and encoder quality. */
const QUALITY: Record<Quality, { scale: number; crf?: number; everyNthFrame: number }> = {
  fast: { scale: 2 / 3, crf: 28, everyNthFrame: 2 },
  balanced: { scale: 1, crf: 23, everyNthFrame: 1 },
  high: { scale: 1, crf: 18, everyNthFrame: 1 },
};

let serveUrlPromise: Promise<string> | null = null;
let running = false;
let timer: NodeJS.Timeout | null = null;

async function getServeUrl(): Promise<string> {
  serveUrlPromise ??= (async () => {
    const { bundle } = await import("@remotion/bundler");
    const entry = path.join(process.cwd(), "src/render/composition/index.ts");
    console.log("[render] bundling composition…");
    const url = await bundle({ entryPoint: entry, onProgress: () => {} });
    console.log("[render] bundle ready");
    return url;
  })();
  return serveUrlPromise;
}

/** Claim the oldest queued export. Returns null when the queue is empty. */
async function claim(): Promise<string | null> {
  const res = await db.execute(sql`
    UPDATE exports SET status = 'rendering', updated_at = now()
    WHERE id = (
      SELECT id FROM exports WHERE status = 'queued'
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id
  `);
  const rows = res.rows as { id: string }[];
  return rows[0]?.id ?? null;
}

async function renderOne(exportId: string): Promise<void> {
  const [job] = await db
    .select({
      id: exportsTable.id,
      format: exportsTable.format,
      quality: exportsTable.quality,
      sceneId: exportsTable.sceneId,
    })
    .from(exportsTable)
    .where(eq(exportsTable.id, exportId));
  if (!job) return;

  try {
    if (!job.sceneId) throw new Error("export has no scene");
    const [scene] = await db
      .select({
        code: scenes.code,
        params: scenes.params,
        durationInFrames: scenes.durationInFrames,
        fps: scenes.fps,
      })
      .from(scenes)
      .where(eq(scenes.id, job.sceneId));
    if (!scene) throw new Error("scene no longer exists");

    const { renderMedia, selectComposition } = await import("@remotion/renderer");
    const serveUrl = await getServeUrl();

    const paramsSchema = (scene.params ?? []) as {
      key: string;
      default: string | number;
    }[];
    const inputProps = {
      code: scene.code,
      params: Object.fromEntries(paramsSchema.map((p) => [p.key, p.default])),
      durationInFrames: scene.durationInFrames,
      fps: scene.fps,
    };

    const composition = await selectComposition({
      serveUrl,
      id: "scene",
      inputProps,
    });

    const q = QUALITY[job.quality as Quality] ?? QUALITY.balanced;
    const format = job.format as Format;
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "genvideo-export-"));
    const outPath = path.join(tmpDir, `out.${format}`);

    try {
      await renderMedia({
        serveUrl,
        composition,
        inputProps,
        codec: CODEC[format],
        outputLocation: outPath,
        scale: q.scale,
        ...(CODEC[format] === "h264" || CODEC[format] === "vp8"
          ? { crf: q.crf }
          : {}),
        ...(format === "gif" ? { everyNthFrame: q.everyNthFrame } : {}),
        timeoutInMilliseconds: 120_000,
        concurrency: 2,
        chromiumOptions: { gl: "swangle" },
        logLevel: "error",
      });

      const data = await readFile(outPath);
      if (data.byteLength > MAX_FILE_BYTES) {
        throw new Error(
          `rendered file too large (${Math.round(data.byteLength / 1e6)}MB)`,
        );
      }

      await db
        .update(exportsTable)
        .set({
          status: "done",
          fileData: data,
          fileSize: data.byteLength,
          error: null,
        })
        .where(eq(exportsTable.id, exportId));
      console.log(
        `[render] export ${exportId} done (${format}, ${Math.round(data.byteLength / 1024)}KB)`,
      );
    } finally {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  } catch (e) {
    const message = (e as Error).message.slice(0, 500);
    console.error(`[render] export ${exportId} failed: ${message}`);
    await db
      .update(exportsTable)
      .set({ status: "failed", error: message })
      .where(eq(exportsTable.id, exportId))
      .catch(() => {});
  }
}

/** Drain the queue one job at a time. Exported for the manual smoke script. */
export async function processQueue(): Promise<void> {
  if (running) return;
  running = true;
  try {
    for (;;) {
      const id = await claim();
      if (!id) break;
      await renderOne(id);
    }
  } catch (e) {
    console.error("[render] worker tick failed:", (e as Error).message);
  } finally {
    running = false;
  }
}

/** Called from index.ts after the HTTP server is up. */
export function startRenderWorker(): void {
  if (process.env.DISABLE_RENDER_WORKER === "1") {
    console.log("[render] worker disabled via DISABLE_RENDER_WORKER");
    return;
  }
  // Recover rows stuck in "rendering" from a previous crashed process.
  void db
    .execute(sql`UPDATE exports SET status = 'queued' WHERE status = 'rendering'`)
    .catch(() => {});
  timer = setInterval(() => void processQueue(), POLL_MS);
  timer.unref();
  console.log("[render] worker started");
}
