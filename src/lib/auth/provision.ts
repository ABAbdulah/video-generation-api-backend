import { db, type Tx } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import { grantCredits } from "@/lib/credits/ledger";

/**
 * Credits every new account starts with — and, on the free plan, the only
 * ones they ever get. This is the free-tier limit: 10 generations to prove
 * the product works, then a plan.
 */
export const SIGNUP_CREDIT_GRANT = 10;

/**
 * Create the user's personal workspace and seed it with the signup grant.
 * Called for every new user regardless of how they signed up
 * (Google OAuth via the Auth.js createUser event, or the signup route).
 */
export async function provisionNewUserTx(
  tx: Tx,
  userId: string,
  name?: string | null,
): Promise<{ workspaceId: string }> {
  const [ws] = await tx
    .insert(workspaces)
    .values({
      name: name ? `${name}'s Workspace` : "Personal",
      ownerId: userId,
    })
    .returning({ id: workspaces.id });

  await grantCredits(tx, {
    workspaceId: ws.id,
    amount: SIGNUP_CREDIT_GRANT,
    reason: "signup_grant",
  });

  return { workspaceId: ws.id };
}

/** Standalone wrapper for callers not already inside a transaction. */
export async function provisionNewUser(
  userId: string,
  name?: string | null,
): Promise<{ workspaceId: string }> {
  return db.transaction((tx) => provisionNewUserTx(tx, userId, name));
}
