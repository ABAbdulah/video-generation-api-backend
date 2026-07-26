/**
 * The library surface (competitor-parity work, 2026-07-26): browse-first UX.
 *
 *   GET /api/templates      — the approved template corpus, public. Swishy's
 *     whole onboarding is "browse 100+ templates, then customize"; ours was
 *     prompt-only even though 47 corpus entries sat in the DB. Code+params are
 *     included so the client can render a template instantly in the sandbox
 *     with zero generation cost. (The corpus is first-party content, already
 *     shipped verbatim inside the frontend test fixtures — not secret.)
 *
 *   GET /api/scenes/recent  — the caller's latest generations, so work is
 *     never lost to a page reload. Scoped to the caller's workspace.
 */
import { Router } from "express";
import { desc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { projects, scenes, templates } from "@/lib/db/schema";
import { requireAuth } from "@/middleware/auth";
import { getUserWorkspace } from "@/lib/workspace";

export const templatesRouter = Router();
export const scenesRouter = Router();

templatesRouter.get("/", async (_req, res) => {
  const rows = await db
    .select({
      slug: templates.slug,
      title: templates.title,
      category: templates.category,
      code: templates.code,
      params: templates.params,
      durationInFrames: templates.durationInFrames,
      fps: templates.fps,
    })
    .from(templates)
    .where(eq(templates.status, "approved"))
    .orderBy(templates.category, templates.title);
  // The corpus changes only on deploy+reseed — let browsers/CDN keep it a while.
  res.setHeader("cache-control", "public, max-age=300");
  res.json({ ok: true, templates: rows });
});

scenesRouter.get("/recent", requireAuth, async (req, res) => {
  const workspace = await getUserWorkspace(req.userId!);
  if (!workspace) {
    res.status(403).json({ ok: false, code: "no_workspace", error: "No workspace found." });
    return;
  }
  const projectIds = (
    await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.workspaceId, workspace.id))
  ).map((p) => p.id);
  if (projectIds.length === 0) {
    res.json({ ok: true, scenes: [] });
    return;
  }
  const rows = await db
    .select({
      sceneId: scenes.id,
      prompt: scenes.prompt,
      code: scenes.code,
      params: scenes.params,
      durationInFrames: scenes.durationInFrames,
      fps: scenes.fps,
      createdAt: scenes.createdAt,
    })
    .from(scenes)
    .where(inArray(scenes.projectId, projectIds))
    .orderBy(desc(scenes.createdAt))
    .limit(12);
  res.json({ ok: true, scenes: rows });
});
