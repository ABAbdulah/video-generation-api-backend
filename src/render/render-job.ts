/**
 * Renders ONE export, then exits. Spawned as a child process by the worker —
 * never imported by the API.
 *
 * WHY A SEPARATE PROCESS: a render drives headless Chrome and FFmpeg for tens
 * of seconds inside the same service that answers HTTP. Isolating it means a
 * Chrome or FFmpeg crash kills one export instead of the API, all render
 * memory is returned to the OS on exit rather than fragmenting a long-lived
 * heap, and a hung render can be killed by process group without touching the
 * server. (Remotion itself renders repeatedly in one process just fine —
 * verified 3/3 in-container — so this is isolation, not a workaround.)
 *
 *   node --import tsx src/render/render-job.ts <exportId>
 */
import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { exports as exportsTable, scenes } from "@/lib/db/schema";

type Format = "mp4" | "webm" | "gif" | "mov";
type Quality = "fast" | "balanced" | "high";

/** Refuse to store files beyond this — a runaway GIF must not bloat the DB. */
const MAX_FILE_BYTES = 60 * 1024 * 1024;

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

/**
 * Where the webpack bundle of the composition lives. The Docker build bakes it
 * (scripts/build-bundle.mjs) so production never pays the ~10s bundling cost;
 * in dev the first render builds it and later ones reuse it.
 */
function bundleDir(): string {
  return (
    process.env.REMOTION_BUNDLE_DIR ??
    path.join(process.cwd(), ".remotion-bundle")
  );
}

async function getServeUrl(): Promise<string> {
  const dir = bundleDir();
  if (existsSync(path.join(dir, "index.html"))) return dir;

  const { bundle } = await import("@remotion/bundler");
  console.log("[render] bundling composition (first run)…");
  return bundle({
    entryPoint: path.join(process.cwd(), "src/render/composition/index.ts"),
    outDir: dir,
    onProgress: () => {},
  });
}

async function main(exportId: string): Promise<void> {
  const [job] = await db
    .select({
      id: exportsTable.id,
      format: exportsTable.format,
      quality: exportsTable.quality,
      sceneId: exportsTable.sceneId,
    })
    .from(exportsTable)
    .where(eq(exportsTable.id, exportId));
  if (!job) throw new Error(`export ${exportId} not found`);
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

  const composition = await selectComposition({ serveUrl, id: "scene", inputProps });

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
      ...(CODEC[format] === "h264" || CODEC[format] === "vp8" ? { crf: q.crf } : {}),
      ...(format === "gif" ? { everyNthFrame: q.everyNthFrame } : {}),
      timeoutInMilliseconds: 120_000,
      concurrency: 2,
      chromiumOptions: {
        // Software rasterizer: containers have no GPU.
        gl: "swangle",
        // Explicit rather than relying on the library default.
        enableMultiProcessOnLinux: true,
      },
      // Remotion truncates thrown errors to 500 chars, which cuts off Chrome's
      // own stderr. RENDER_LOG_LEVEL=verbose streams the full browser output
      // to the service logs when diagnosing a deployment render failure.
      logLevel:
        (process.env.RENDER_LOG_LEVEL as "error" | "info" | "verbose") ?? "error",
    });

    const data = await readFile(outPath);
    if (data.byteLength > MAX_FILE_BYTES) {
      throw new Error(`rendered file too large (${Math.round(data.byteLength / 1e6)}MB)`);
    }

    await db
      .update(exportsTable)
      .set({ status: "done", fileData: data, fileSize: data.byteLength, error: null })
      .where(eq(exportsTable.id, exportId));
    console.log(
      `[render] export ${exportId} done (${format}, ${Math.round(data.byteLength / 1024)}KB)`,
    );
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

const exportId = process.argv[2];
if (!exportId) {
  console.error("usage: render-job <exportId>");
  process.exit(2);
}

try {
  await main(exportId);
  process.exit(0);
} catch (e) {
  // The worker marks the row failed using this output; keep it on one stream.
  console.error((e as Error).message);
  process.exit(1);
}
