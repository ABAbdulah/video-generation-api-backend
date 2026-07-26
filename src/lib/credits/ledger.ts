import { eq, sql } from "drizzle-orm";
import type { Db, Tx } from "@/lib/db";
import { creditTxns } from "@/lib/db/schema";

/**
 * Append-only credit ledger.
 *
 * Rules (enforced here, do not work around them):
 *  - Balance is ALWAYS derived: SUM(delta). Never store or cache it in the DB.
 *  - Debits MUST happen inside a DB transaction (the type signature requires a
 *    Tx), in the same transaction as the record that justifies the charge
 *    (e.g. the generated scene). A user is never charged for a failed generation.
 *  - Concurrent debits against one workspace are serialized with a pg advisory
 *    xact lock, so two simultaneous requests cannot both spend the same credits.
 */

export class InsufficientCreditsError extends Error {
  constructor(
    public readonly workspaceId: string,
    public readonly balance: number,
    public readonly requested: number,
  ) {
    super(
      `Insufficient credits: workspace ${workspaceId} has ${balance}, needs ${requested}`,
    );
    this.name = "InsufficientCreditsError";
  }
}

type DbOrTx = Db | Tx;

export async function getBalance(
  dbx: DbOrTx,
  workspaceId: string,
): Promise<number> {
  const [row] = await dbx
    .select({
      balance: sql<number>`coalesce(sum(${creditTxns.delta}), 0)::int`,
    })
    .from(creditTxns)
    .where(eq(creditTxns.workspaceId, workspaceId));
  return row?.balance ?? 0;
}

export interface GrantArgs {
  workspaceId: string;
  amount: number; // positive
  reason: string;
  modelId?: string;
  sceneId?: string;
}

/** Add credits (signup grant, purchase, refund). */
export async function grantCredits(
  dbx: DbOrTx,
  { workspaceId, amount, reason, modelId, sceneId }: GrantArgs,
): Promise<void> {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(`grantCredits: amount must be a positive integer, got ${amount}`);
  }
  await dbx.insert(creditTxns).values({
    workspaceId,
    delta: amount,
    reason,
    modelId,
    sceneId,
  });
}

export interface DebitArgs {
  workspaceId: string;
  amount: number; // positive; stored as negative delta
  reason: string;
  modelId?: string;
  sceneId?: string;
}

/**
 * Spend credits. Requires a Tx: call inside db.transaction(...) alongside the
 * insert of whatever the user is paying for. Throws InsufficientCreditsError
 * (rolling back the whole transaction) if the balance doesn't cover it.
 */
export async function debitCredits(
  tx: Tx,
  { workspaceId, amount, reason, modelId, sceneId }: DebitArgs,
): Promise<void> {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(`debitCredits: amount must be a positive integer, got ${amount}`);
  }

  // Serialize debits per workspace for the duration of this transaction.
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${workspaceId}))`,
  );

  const balance = await getBalance(tx, workspaceId);
  if (balance < amount) {
    throw new InsufficientCreditsError(workspaceId, balance, amount);
  }

  await tx.insert(creditTxns).values({
    workspaceId,
    delta: -amount,
    reason,
    modelId,
    sceneId,
  });
}
