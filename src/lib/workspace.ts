/**
 * Workspace + default-project resolution for authenticated requests.
 *
 * Every user gets exactly one personal workspace at signup
 * (see lib/auth/provision.ts). Scenes hang off a project, so the editor needs a
 * project to write into before the user has ever thought about projects — hence
 * the lazily-created "Untitled Project".
 */
import { and, asc, eq } from "drizzle-orm";
import { db, type Db, type Tx } from "@/lib/db";
import { projects, workspaces } from "@/lib/db/schema";

export interface ResolvedWorkspace {
  id: string;
  subscriptionTier: "free" | "beginner" | "pro";
}

/**
 * The caller's workspace. Returns null rather than throwing so routes can map
 * it to a clean 403 — a session whose user row has since been deleted is a
 * normal condition, not a server fault.
 */
export async function getUserWorkspace(
  userId: string,
): Promise<ResolvedWorkspace | null> {
  const ws = await db.query.workspaces.findFirst({
    where: eq(workspaces.ownerId, userId),
    columns: { id: true, subscriptionTier: true },
  });
  return ws ?? null;
}

export const DEFAULT_PROJECT_NAME = "Untitled Project";

/**
 * Find (or create) the workspace's default project.
 *
 * Takes a Db *or* Tx so the route can run it inside the same transaction as the
 * scene insert — a project created for a generation that then fails must roll
 * back with it, not linger as an empty shell.
 */
export async function getOrCreateDefaultProject(
  dbx: Db | Tx,
  workspaceId: string,
): Promise<string> {
  const [existing] = await dbx
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.workspaceId, workspaceId))
    .orderBy(asc(projects.createdAt))
    .limit(1);
  if (existing) return existing.id;

  const [created] = await dbx
    .insert(projects)
    .values({ workspaceId, name: DEFAULT_PROJECT_NAME })
    .returning({ id: projects.id });
  return created.id;
}

/**
 * Verify a client-supplied projectId actually belongs to this workspace.
 * Guards the obvious IDOR: writing a scene into someone else's project.
 */
export async function assertProjectInWorkspace(
  dbx: Db | Tx,
  projectId: string,
  workspaceId: string,
): Promise<boolean> {
  const [row] = await dbx
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)),
    )
    .limit(1);
  return !!row;
}
