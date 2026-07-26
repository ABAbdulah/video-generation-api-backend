/**
 * MANUAL end-to-end render smoke test (M11):
 * grabs the newest scene in the DB, queues one export per requested format,
 * drains the queue through the real Remotion pipeline, and reports sizes.
 * First run downloads Chrome Headless Shell (~minutes).
 *
 *   pnpm smoke:render            # mp4 only
 *   pnpm smoke:render all        # mp4 + webm + gif
 */
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { exports as exportsTable, scenes } from "@/lib/db/schema";
import { processQueue } from "@/render/worker";

const ALL = ["mp4", "webm", "gif"] as const;
type Fmt = (typeof ALL)[number];
const picked = process.argv.slice(2).filter((a): a is Fmt =>
  (ALL as readonly string[]).includes(a),
);
const formats: readonly Fmt[] = process.argv.includes("all")
  ? ALL
  : picked.length > 0
    ? picked
    : (["mp4"] as const);

const [scene] = await db
  .select({ id: scenes.id, projectId: scenes.projectId, prompt: scenes.prompt })
  .from(scenes)
  .orderBy(desc(scenes.createdAt))
  .limit(1);
if (!scene) {
  console.error("No scenes in the DB — generate one in the editor first.");
  process.exit(1);
}
console.log(`Scene ${scene.id} — "${scene.prompt?.slice(0, 60)}"`);

const ids: string[] = [];
for (const format of formats) {
  const [row] = await db
    .insert(exportsTable)
    .values({ projectId: scene.projectId, sceneId: scene.id, format, quality: "fast" })
    .returning({ id: exportsTable.id });
  ids.push(row.id);
  console.log(`queued ${format} → ${row.id}`);
}

const started = Date.now();
await processQueue();

for (const id of ids) {
  const [row] = await db
    .select({
      status: exportsTable.status,
      format: exportsTable.format,
      fileSize: exportsTable.fileSize,
      error: exportsTable.error,
    })
    .from(exportsTable)
    .where(eq(exportsTable.id, id));
  console.log(
    `${row.format}: ${row.status}` +
      (row.fileSize ? ` (${Math.round(row.fileSize / 1024)}KB)` : "") +
      (row.error ? ` — ${row.error}` : ""),
  );
  if (row.status !== "done") process.exitCode = 1;
}
console.log(`total ${(Date.now() - started) / 1000 | 0}s`);
process.exit(process.exitCode ?? 0);
