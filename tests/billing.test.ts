import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import request from "supertest";

import { createApp } from "@/app";
import { signSession } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { provisionNewUser } from "@/lib/auth/provision";

const app = createApp();

let userId: string;
let token: string;

beforeAll(async () => {
  const [u] = await db
    .insert(users)
    .values({ email: `billing-${crypto.randomUUID()}@example.test` })
    .returning({ id: users.id });
  userId = u.id;
  await provisionNewUser(userId, "Billing Test");
  token = signSession(userId);
});

afterAll(async () => {
  await db.delete(users).where(eq(users.id, userId));
});

describe("GET /api/billing/plans", () => {
  it("is public and lists free alongside both paid plans", async () => {
    const res = await request(app).get("/api/billing/plans");
    expect(res.status).toBe(200);
    // Free is included so the dialog can show "what I'm on" next to "what I'd get".
    expect(res.body.plans.map((p: { tier: string }) => p.tier)).toEqual([
      "free",
      "beginner",
      "pro",
    ]);
  });

  it("marks the free plan as not purchasable", async () => {
    const res = await request(app).get("/api/billing/plans");
    const free = res.body.plans.find((p: { tier: string }) => p.tier === "free");
    expect(free.available).toBe(false);
  });

  it("never leaks Polar product ids to the client", async () => {
    const res = await request(app).get("/api/billing/plans");
    expect(JSON.stringify(res.body)).not.toContain("productId");
  });

  it("defaults to the sandbox server so a misconfig can't take real money", async () => {
    const res = await request(app).get("/api/billing/plans");
    expect(res.body.sandbox).toBe(true);
  });
});

describe("POST /api/billing/checkout", () => {
  it("401s without a session", async () => {
    const res = await request(app)
      .post("/api/billing/checkout")
      .send({ plan: "pro" });
    expect(res.status).toBe(401);
  });

  it("400s an unknown plan", async () => {
    const res = await request(app)
      .post("/api/billing/checkout")
      .set("authorization", `Bearer ${token}`)
      .send({ plan: "enterprise" });
    expect(res.status).toBe(400);
  });

  it("503s cleanly when Polar isn't configured (no keys in test env)", async () => {
    const res = await request(app)
      .post("/api/billing/checkout")
      .set("authorization", `Bearer ${token}`)
      .send({ plan: "pro" });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("billing_unavailable");
  });
});

describe("POST /api/billing/webhook", () => {
  it("rejects an unsigned payload rather than granting a plan", async () => {
    const res = await request(app)
      .post("/api/billing/webhook")
      .set("content-type", "application/json")
      .send({ type: "subscription.active", data: { metadata: { tier: "pro" } } });
    // 503 when no secret is configured, 403 when one is but the signature is
    // missing. Either way: never 200, and never an upgrade.
    expect([403, 503]).toContain(res.status);
  });
});
