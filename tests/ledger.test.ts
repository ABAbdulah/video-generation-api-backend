import { describe, it, expect, afterAll } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { creditTxns, users, workspaces } from "@/lib/db/schema";
import {
  debitCredits,
  getBalance,
  grantCredits,
  InsufficientCreditsError,
} from "@/lib/credits/ledger";
import {
  provisionNewUser,
  SIGNUP_CREDIT_GRANT,
} from "@/lib/auth/provision";

const testEmail = `ledger-test-${crypto.randomUUID()}@example.test`;
let userId: string;
let workspaceId: string;

afterAll(async () => {
  // users cascade → workspaces cascade → credit_txns
  if (userId) await db.delete(users).where(eq(users.id, userId));
});

describe("credit ledger (append-only)", () => {
  it("provisions a new user with a personal workspace and signup grant", async () => {
    const [user] = await db
      .insert(users)
      .values({ email: testEmail, name: "Ledger Test" })
      .returning({ id: users.id });
    userId = user.id;

    const result = await provisionNewUser(userId, "Ledger Test");
    workspaceId = result.workspaceId;

    const ws = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, workspaceId),
    });
    expect(ws?.ownerId).toBe(userId);
    expect(ws?.subscriptionTier).toBe("free");

    expect(await getBalance(db, workspaceId)).toBe(SIGNUP_CREDIT_GRANT);
  });

  it("derives balance from SUM(delta) across grants and debits", async () => {
    await grantCredits(db, { workspaceId, amount: 10, reason: "test_topup" });
    expect(await getBalance(db, workspaceId)).toBe(SIGNUP_CREDIT_GRANT + 10);

    await db.transaction((tx) =>
      debitCredits(tx, {
        workspaceId,
        amount: 5,
        reason: "generation",
        modelId: "test/model",
      }),
    );
    expect(await getBalance(db, workspaceId)).toBe(SIGNUP_CREDIT_GRANT + 5);
  });

  it("rejects a debit beyond the balance and rolls the transaction back", async () => {
    const before = await getBalance(db, workspaceId);

    await expect(
      db.transaction(async (tx) => {
        await debitCredits(tx, {
          workspaceId,
          amount: before + 1,
          reason: "generation",
        });
      }),
    ).rejects.toThrow(InsufficientCreditsError);

    // Balance unchanged, no orphan negative row.
    expect(await getBalance(db, workspaceId)).toBe(before);
  });

  it("rejects non-positive and non-integer amounts", async () => {
    await expect(
      grantCredits(db, { workspaceId, amount: 0, reason: "bad" }),
    ).rejects.toThrow(/positive integer/);
    await expect(
      grantCredits(db, { workspaceId, amount: 2.5, reason: "bad" }),
    ).rejects.toThrow(/positive integer/);
    await expect(
      db.transaction((tx) =>
        debitCredits(tx, { workspaceId, amount: -3, reason: "bad" }),
      ),
    ).rejects.toThrow(/positive integer/);
  });

  it("keeps every movement as a ledger row (no mutable balance anywhere)", async () => {
    const rows = await db
      .select()
      .from(creditTxns)
      .where(eq(creditTxns.workspaceId, workspaceId));
    // signup grant + topup + successful debit (failed debit rolled back)
    expect(rows).toHaveLength(3);
    const sum = rows.reduce((acc, r) => acc + r.delta, 0);
    expect(sum).toBe(await getBalance(db, workspaceId));
  });
});
