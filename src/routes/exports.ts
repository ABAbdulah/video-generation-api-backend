/**
 * Export endpoints (M11). Export is a PAID feature: any plan above `free`
 * unlocks every format. The free tier gets a clean 403 the UI renders as an
 * upgrade prompt — the same two-dimensional gating philosophy as generation
 * (plan checked server-side, never trusted from the client).
 */
import { Router } from "express";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { exports as exportsTable, projects, scenes } from "@/lib/db/schema";
import { requireAuth } from "@/middleware/auth";
import { getUserWorkspace } from "@/lib/workspace";

export const exportsRouter = Router();
exportsRouter.use(requireAuth);

// "mov" exists in the DB enum but renders via ProRes into enormous files —
// deliberately not offered until there's a real need.
const createSchema = z.object({
  sceneId: z.string().min(1).max(64),
  format: z.enum(["mp4", "webm", "gif"]),
  quality: z.enum(["fast", "balanced", "high"]).optional(),
});

const MIME: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  gif: "image/gif",
  mov: "video/quicktime",
};

/** The scene, but only if it belongs to the caller's workspace (IDOR guard). */
async function ownedScene(sceneId: string, workspaceId: string) {
  const [row] = await db
    .select({ id: scenes.id, projectId: scenes.projectId })
    .from(scenes)
    .innerJoin(projects, eq(scenes.projectId, projects.id))
    .where(and(eq(scenes.id, sceneId), eq(projects.workspaceId, workspaceId)));
  return row ?? null;
}

exportsRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, code: "invalid_body", error: "Validation failed" });
    return;
  }

  const workspace = await getUserWorkspace(req.userId!);
  if (!workspace) {
    res.status(403).json({ ok: false, code: "no_workspace", error: "No workspace found." });
    return;
  }
  if (workspace.subscriptionTier === "free") {
    res.status(403).json({
      ok: false,
      code: "tier_locked",
      error: "Exporting videos requires a paid plan.",
    });
    return;
  }

  const scene = await ownedScene(parsed.data.sceneId, workspace.id);
  if (!scene) {
    res.status(404).json({ ok: false, code: "invalid_body", error: "Unknown scene." });
    return;
  }

  const [row] = await db
    .insert(exportsTable)
    .values({
      projectId: scene.projectId,
      sceneId: scene.id,
      format: parsed.data.format,
      quality: parsed.data.quality ?? "balanced",
    })
    .returning({ id: exportsTable.id, status: exportsTable.status });

  res.status(202).json({ ok: true, id: row.id, status: row.status });
});

/** Status + metadata for polling. Never includes the bytes. */
exportsRouter.get("/:id", async (req, res) => {
  const workspace = await getUserWorkspace(req.userId!);
  if (!workspace) {
    res.status(403).json({ ok: false, code: "no_workspace", error: "No workspace found." });
    return;
  }

  const [row] = await db
    .select({
      id: exportsTable.id,
      status: exportsTable.status,
      format: exportsTable.format,
      quality: exportsTable.quality,
      error: exportsTable.error,
      fileSize: exportsTable.fileSize,
      workspaceId: projects.workspaceId,
    })
    .from(exportsTable)
    .innerJoin(projects, eq(exportsTable.projectId, projects.id))
    .where(eq(exportsTable.id, req.params.id));

  if (!row || row.workspaceId !== workspace.id) {
    res.status(404).json({ ok: false, code: "invalid_body", error: "Unknown export." });
    return;
  }

  const { workspaceId: _ws, ...pub } = row;
  res.json({ ok: true, ...pub });
});

exportsRouter.get("/:id/download", async (req, res) => {
  const workspace = await getUserWorkspace(req.userId!);
  if (!workspace) {
    res.status(403).json({ ok: false, code: "no_workspace", error: "No workspace found." });
    return;
  }

  const [row] = await db
    .select({
      id: exportsTable.id,
      status: exportsTable.status,
      format: exportsTable.format,
      fileData: exportsTable.fileData,
      workspaceId: projects.workspaceId,
    })
    .from(exportsTable)
    .innerJoin(projects, eq(exportsTable.projectId, projects.id))
    .where(eq(exportsTable.id, req.params.id));

  if (!row || row.workspaceId !== workspace.id) {
    res.status(404).json({ ok: false, code: "invalid_body", error: "Unknown export." });
    return;
  }
  if (row.status !== "done" || !row.fileData) {
    res.status(409).json({ ok: false, code: "not_ready", error: "Export is not ready yet." });
    return;
  }

  res.setHeader("content-type", MIME[row.format] ?? "application/octet-stream");
  res.setHeader(
    "content-disposition",
    `attachment; filename="genvideo-${row.id.slice(0, 8)}.${row.format}"`,
  );
  res.send(Buffer.from(row.fileData));
});

/** Recent exports for a scene — lets the UI resume after a reload. */
exportsRouter.get("/scene/:sceneId/list", async (req, res) => {
  const workspace = await getUserWorkspace(req.userId!);
  if (!workspace) {
    res.status(403).json({ ok: false, code: "no_workspace", error: "No workspace found." });
    return;
  }
  const scene = await ownedScene(req.params.sceneId, workspace.id);
  if (!scene) {
    res.status(404).json({ ok: false, code: "invalid_body", error: "Unknown scene." });
    return;
  }
  const rows = await db
    .select({
      id: exportsTable.id,
      status: exportsTable.status,
      format: exportsTable.format,
      quality: exportsTable.quality,
      error: exportsTable.error,
      fileSize: exportsTable.fileSize,
      createdAt: exportsTable.createdAt,
    })
    .from(exportsTable)
    .where(eq(exportsTable.sceneId, scene.id))
    .orderBy(desc(exportsTable.createdAt))
    .limit(10);
  res.json({ ok: true, exports: rows });
});
