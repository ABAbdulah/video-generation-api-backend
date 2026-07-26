/**
 * The export render worker (M11), running in-process with the API.
 *
 * Design: the `exports` table IS the queue (spec §2 — services communicate
 * through the DB only). The worker claims one queued row at a time with
 * FOR UPDATE SKIP LOCKED (safe if the service ever scales to replicas), then
 * hands the job to a CHILD PROCESS (src/render/render-job.ts) and waits.
 *
 * Rendering deliberately does not happen in this process:
 *   - A Chrome/FFmpeg crash kills one export, not the API serving HTTP.
 *   - All render memory is returned to the OS when the child exits.
 *   - A hung render can be killed by process group without risking the server.
 *
 * One job at a time per process: renderMedia already parallelizes across
 * frames, and containers don't have memory for two Chromes.
 */
import path from "node:path";
import { spawn } from "node:child_process";
import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { exports as exportsTable } from "@/lib/db/schema";

const POLL_MS = 3000;
/** A render that outruns this is treated as hung and the row is failed. */
const JOB_TIMEOUT_MS = 10 * 60 * 1000;
/**
 * A browser launch can fail transiently under memory pressure (a co-tenant
 * render, a cold container). The job is already isolated in its own process,
 * so retrying costs only time and turns a transient launch failure into a
 * completed export instead of a user-visible one.
 */
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1500;

let running = false;
let timer: NodeJS.Timeout | null = null;

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

/**
 * Run one export in a child process, retrying a flaky browser launch. Never
 * throws — a failed render is recorded on the row, not propagated.
 */
async function runJob(exportId: string): Promise<void> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const { ok, stderr } = await spawnJob(exportId);
    if (ok) return;

    if (attempt < MAX_ATTEMPTS) {
      console.warn(
        `[render] export ${exportId} attempt ${attempt}/${MAX_ATTEMPTS} failed, retrying`,
      );
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      continue;
    }

    // The child marks its own row done on success; on final failure the parent
    // records it, so a child that died before touching the DB (OOM kill, spawn
    // failure) still leaves an explanatory row rather than one stuck in
    // "rendering".
    await db
      .update(exportsTable)
      .set({
        status: "failed",
        error: (stderr.trim() || "render process failed").slice(-4000),
      })
      .where(eq(exportsTable.id, exportId))
      .catch(() => {});
  }
}

/** One spawn attempt. Resolves with the child's outcome and stderr. */
function spawnJob(exportId: string): Promise<{ ok: boolean; stderr: string }> {
  return new Promise((resolve) => {
    const script = path.join(process.cwd(), "src/render/render-job.ts");
    // The parent already runs under tsx; the child re-uses the same Node
    // binary with tsx registered, which keeps this working in dev (tsx watch)
    // and in the container without depending on a package manager on PATH.
    // `detached` puts the child in its own process group. Remotion tears
    // Chrome down by killing a process *group*, so giving each render its own
    // group keeps that teardown (and our timeout kill below) scoped to the
    // job it belongs to rather than reaching the worker's own processes.
    const child = spawn(process.execPath, ["--import", "tsx", script, exportId], {
      stdio: ["ignore", "inherit", "pipe"],
      env: process.env,
      detached: process.platform !== "win32",
    });

    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });

    const timeout = setTimeout(() => {
      stderr += `\nrender exceeded ${JOB_TIMEOUT_MS / 1000}s and was killed`;
      // Kill the whole group so a hung Chrome dies with its job rather than
      // outliving it as an orphan (the child leads its own group above).
      try {
        if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    }, JOB_TIMEOUT_MS);

    const finish = (ok: boolean) => {
      clearTimeout(timeout);
      resolve({ ok, stderr });
    };

    child.on("error", (e) => {
      stderr += `\nfailed to spawn render process: ${e.message}`;
      finish(false);
    });
    child.on("close", (code) => {
      console.log(`[render] render process for ${exportId} exited with code ${code}`);
      finish(code === 0);
    });
  });
}

/** Drain the queue one job at a time. Exported for the manual smoke script. */
export async function processQueue(): Promise<void> {
  if (running) return;
  running = true;
  try {
    for (;;) {
      const id = await claim();
      if (!id) break;
      console.log(`[render] claimed export ${id}`);
      await runJob(id);
      console.log(`[render] finished export ${id}`);
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
  // Recover rows stuck in "rendering" by a crashed process — but ONLY ones
  // older than the longest possible render. A blanket reset would let a
  // restarting worker re-queue a row another worker (or another replica) is
  // actively rendering, producing two Chromes racing on the same job.
  void db
    .execute(
      sql`UPDATE exports SET status = 'queued'
          WHERE status = 'rendering' AND updated_at < now() - interval '15 minutes'`,
    )
    .catch(() => {});
  timer = setInterval(() => void processQueue(), POLL_MS);
  timer.unref();
  console.log("[render] worker started");
}
