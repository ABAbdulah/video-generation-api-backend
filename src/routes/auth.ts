import { Router } from "express";

import { login, signup } from "@/lib/auth/service";
import { requireAuth } from "@/middleware/auth";
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import { users } from "@/lib/db/schema";
import { getUserWorkspace } from "@/lib/workspace";
import { getBalance } from "@/lib/credits/ledger";

export const authRouter = Router();

authRouter.post("/signup", async (req, res) => {
  const result = await signup(req.body);
  res.status(result.status).json(result.body);
});

authRouter.post("/login", async (req, res) => {
  const result = await login(req.body);
  res.status(result.status).json(result.body);
});

/**
 * The editor's bootstrap call: who am I, what plan am I on, what's my balance.
 * Everything the monorepo's Server Component used to resolve in-process.
 */
authRouter.get("/me", requireAuth, async (req, res) => {
  const userId = req.userId!;
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, email: true, name: true },
  });
  if (!user) {
    res.status(401).json({ error: "Account no longer exists." });
    return;
  }
  const workspace = await getUserWorkspace(userId);
  if (!workspace) {
    res.status(403).json({ error: "No workspace found for this account." });
    return;
  }
  const balance = await getBalance(db, workspace.id);
  res.json({
    user,
    workspace: { id: workspace.id, subscriptionTier: workspace.subscriptionTier },
    balance,
  });
});
