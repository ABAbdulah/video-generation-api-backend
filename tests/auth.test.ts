import { describe, it, expect, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

import { db } from "@/lib/db";
import { users, workspaces } from "@/lib/db/schema";
import { getBalance } from "@/lib/credits/ledger";
import { SIGNUP_CREDIT_GRANT } from "@/lib/auth/provision";
import { login, signup } from "@/lib/auth/service";
import { signSession, verifySession } from "@/lib/auth/jwt";

const email = `auth-test-${crypto.randomUUID()}@example.test`;
const password = "correct-horse-battery";

afterAll(async () => {
  await db.delete(users).where(eq(users.email, email));
});

describe("signup", () => {
  it("rejects an invalid payload", async () => {
    const res = await signup({ email: "nope", password: "x" });
    expect(res.status).toBe(400);
  });

  it("creates user + workspace + signup grant atomically", async () => {
    const res = await signup({ email, password, name: "Auth Test" });
    expect(res.status).toBe(201);
    expect("ok" in res.body && res.body.ok).toBe(true);

    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });
    expect(user).toBeDefined();
    // password stored hashed, verifiable, and never plaintext
    expect(user!.passwordHash).not.toBe(password);
    expect(await bcrypt.compare(password, user!.passwordHash!)).toBe(true);

    const ws = await db.query.workspaces.findFirst({
      where: eq(workspaces.ownerId, user!.id),
    });
    expect(ws).toBeDefined();
    expect(await getBalance(db, ws!.id)).toBe(SIGNUP_CREDIT_GRANT);
  });

  it("rejects a duplicate email with 409", async () => {
    const res = await signup({ email, password });
    expect(res.status).toBe(409);
  });

  it("returns a session token that verifies back to the new user", async () => {
    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });
    const res = await login({ email, password });
    expect(res.status).toBe(200);
    if (!("ok" in res.body)) throw new Error("expected success body");
    expect(verifySession(res.body.token)).toBe(user!.id);
  });
});

describe("login", () => {
  it("rejects a wrong password with the same message as an unknown email", async () => {
    const wrongPw = await login({ email, password: "not-the-password" });
    const unknown = await login({
      email: `ghost-${crypto.randomUUID()}@example.test`,
      password,
    });
    expect(wrongPw.status).toBe(401);
    expect(unknown.status).toBe(401);
    // Identical bodies — no account-existence oracle.
    expect(wrongPw.body).toEqual(unknown.body);
  });
});

describe("jwt wiring", () => {
  it("signs and verifies a session round-trip", () => {
    const token = signSession("user-123");
    expect(verifySession(token)).toBe("user-123");
  });

  it("rejects a tampered token", () => {
    const token = signSession("user-123");
    expect(verifySession(token.slice(0, -2) + "xx")).toBeNull();
  });
});
