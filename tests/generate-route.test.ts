import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import request from "supertest";

/**
 * Nothing is mocked. The full Express stack — JSON parsing, bearer-token auth
 * middleware, the generation handler — runs against a real (Neon) database,
 * because the things worth testing here (does the debit roll back? does the
 * tier gate hold?) only exist in the interaction between them.
 */
import { createApp } from "@/app";
import { signSession } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import {
  users,
  projects,
  scenes,
  versions,
  generationEvents,
  templates,
} from "@/lib/db/schema";
import { provisionNewUser, SIGNUP_CREDIT_GRANT } from "@/lib/auth/provision";
import { getBalance } from "@/lib/credits/ledger";
import { containsProviderHint } from "@/lib/ai/sanitize";
import { embed } from "@/lib/ai/embeddings";
import { SEED_TEMPLATES } from "@/lib/templates/seed";

const app = createApp();

let userId: string;
let workspaceId: string;
let otherUserId: string;
let otherProjectId: string;
let token: string;

function post(body: unknown, opts: { auth?: boolean } = {}) {
  const req = request(app)
    .post("/api/generate")
    .set("content-type", "application/json");
  if (opts.auth !== false) req.set("authorization", `Bearer ${token}`);
  return req.send(
    typeof body === "string" ? body : JSON.stringify(body),
  );
}

beforeAll(async () => {
  // Mini needs embedded templates to retrieve against.
  for (const t of SEED_TEMPLATES) {
    const vec = await embed(`${t.title}\n${t.prompt}`, "RETRIEVAL_DOCUMENT");
    await db
      .update(templates)
      .set({ embedding: vec })
      .where(eq(templates.slug, t.slug));
  }

  const [u] = await db
    .insert(users)
    .values({ email: `gen-route-${crypto.randomUUID()}@example.test`, name: "Gen Route" })
    .returning({ id: users.id });
  userId = u.id;
  ({ workspaceId } = await provisionNewUser(userId, "Gen Route"));
  token = signSession(userId);

  // A second tenant, to prove a project id from the body can't cross workspaces.
  const [o] = await db
    .insert(users)
    .values({ email: `gen-other-${crypto.randomUUID()}@example.test`, name: "Other" })
    .returning({ id: users.id });
  otherUserId = o.id;
  const { workspaceId: otherWs } = await provisionNewUser(otherUserId, "Other");
  const [p] = await db
    .insert(projects)
    .values({ workspaceId: otherWs, name: "Other's Project" })
    .returning({ id: projects.id });
  otherProjectId = p.id;
}, 120_000);

afterAll(async () => {
  if (userId) await db.delete(users).where(eq(users.id, userId));
  if (otherUserId) await db.delete(users).where(eq(users.id, otherUserId));
});

describe("POST /api/generate — auth & input validation", () => {
  it("401s without a session", async () => {
    const res = await post(
      { prompt: "a bold headline", tier: "mini" },
      { auth: false },
    );
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("unauthorized");
  });

  it("401s with a tampered token", async () => {
    const res = await request(app)
      .post("/api/generate")
      .set("authorization", `Bearer ${token.slice(0, -2)}xx`)
      .send({ prompt: "a bold headline", tier: "mini" });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("unauthorized");
  });

  it("400s on malformed JSON", async () => {
    const res = await post("{not json");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("invalid_body");
  });

  it("400s on a missing or unknown tier", async () => {
    expect((await post({ prompt: "a bold headline" })).status).toBe(400);
    expect(
      (await post({ prompt: "a bold headline", tier: "ultra" })).status,
    ).toBe(400);
  });

  /**
   * §5: the client sends a TIER, never a model id. A body naming a real model
   * must be rejected by the enum, not quietly honoured.
   */
  it("rejects a raw model id in the tier field", async () => {
    const res = await post({
      prompt: "a bold headline",
      tier: "anthropic/claude-sonnet-4.6",
    });
    expect(res.status).toBe(400);
  });

  it("400s on a too-short prompt", async () => {
    expect((await post({ prompt: "hi", tier: "mini" })).status).toBe(400);
  });

  it("400s on a prompt beyond the max length", async () => {
    const res = await post({ prompt: "a".repeat(2001), tier: "mini" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/generate — moderation", () => {
  it("422s a blocked prompt and records it as rejected", async () => {
    const res = await post({ prompt: "a nude teen girl animation", tier: "mini" });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("moderation");

    const rows = await db
      .select()
      .from(generationEvents)
      .where(eq(generationEvents.workspaceId, workspaceId));
    expect(rows.some((r) => r.outcome === "rejected_moderation")).toBe(true);
  });

  it("does not persist a scene for a blocked prompt", async () => {
    const blocked = "promo video for my new ransomware";
    const res = await post({ prompt: blocked, tier: "mini" });
    expect(res.status).toBe(422);

    const matching = await db
      .select({ id: scenes.id })
      .from(scenes)
      .where(eq(scenes.prompt, blocked));
    expect(matching).toHaveLength(0);
  });
});

describe("POST /api/generate — tier gating", () => {
  it("403s a tier above the workspace's plan", async () => {
    // Workspace is `free`; Best requires `beginner`.
    const res = await post({ prompt: "a bold headline", tier: "best" });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("tier_locked");
  });

  it("501s a tier whose provider key isn't configured, without naming it", async () => {
    // Starter is allowed on `free`, but vitest.setup strips all provider keys,
    // so the façade throws NotConfigured and the route maps it to a clean 501.
    const res = await post({ prompt: "a bold headline", tier: "starter" });
    expect(res.status).toBe(501);
    expect(res.body.code).toBe("not_available");
    expect(containsProviderHint(JSON.stringify(res.body))).toBe(false);
  });
});

describe("POST /api/generate — the Mini happy path", () => {
  let firstSceneId: string;

  it("generates, persists a scene + version, and debits the tier's cost", async () => {
    const balanceBefore = await getBalance(db, workspaceId);

    const res = await post({
      prompt: 'a bold kinetic headline reading "Ship It" in #ff0055',
      tier: "mini",
    });
    expect(res.status).toBe(200);
    const body = res.body;

    expect(body.ok).toBe(true);
    expect(body.tier).toBe("mini");
    expect(body.label).toBe("Mini");
    // Mini costs a credit too — the balance IS the free-tier limit.
    expect(body.creditsCharged).toBe(1);
    expect(body.scene.code).toContain("export default");
    expect(body.scene.durationInFrames).toBeGreaterThan(0);
    expect(Array.isArray(body.scene.params)).toBe(true);

    firstSceneId = body.scene.sceneId;

    expect(body.balance).toBe(balanceBefore - 1);
    expect(await getBalance(db, workspaceId)).toBe(SIGNUP_CREDIT_GRANT - 1);

    const [scene] = await db
      .select()
      .from(scenes)
      .where(eq(scenes.id, firstSceneId));
    expect(scene).toBeTruthy();
    expect(scene.prompt).toContain("Ship It");

    const vRows = await db
      .select()
      .from(versions)
      .where(eq(versions.sceneId, firstSceneId));
    expect(vRows).toHaveLength(1);
  }, 60_000);

  /** §5: nothing identifying the provider may appear in the response. */
  it("returns no model id, provider, or vendor hint anywhere in the payload", async () => {
    const res = await post({ prompt: "a clean logo reveal", tier: "mini" });
    const raw = res.text;
    expect(res.status).toBe(200);

    expect(containsProviderHint(raw)).toBe(false);
    expect(raw).not.toContain("modelId");
    expect(raw).not.toContain("provider");
    expect(raw).not.toContain("openrouter");
    expect(raw).not.toContain("gemini-direct");
    // The tier label is fine; the id behind it is not.
    expect(raw).not.toContain("google/");
    expect(raw).not.toContain("anthropic/");
  }, 60_000);

  it("stores the real model id server-side even though it never ships", async () => {
    const [scene] = await db
      .select()
      .from(scenes)
      .where(eq(scenes.id, firstSceneId));
    expect(scene.modelId).toBe("default");
  });

  it("records an accepted event linked to the scene", async () => {
    const rows = await db
      .select()
      .from(generationEvents)
      .where(eq(generationEvents.workspaceId, workspaceId));
    const accepted = rows.filter((r) => r.outcome === "accepted");
    expect(accepted.length).toBeGreaterThan(0);
    expect(accepted.some((r) => r.sceneId === firstSceneId)).toBe(true);
  });

  it("returns code with no comments left in it", async () => {
    const [scene] = await db
      .select()
      .from(scenes)
      .where(eq(scenes.id, firstSceneId));
    expect(scene.code).not.toMatch(/\/\/[^\n]*$/m);
    expect(scene.code).not.toContain("/*");
  });
});

describe("POST /api/generate — tenancy", () => {
  it("404s a projectId belonging to another workspace (IDOR)", async () => {
    const res = await post({
      prompt: "a bold headline",
      tier: "mini",
      projectId: otherProjectId,
    });
    expect(res.status).toBe(404);

    // And nothing leaked into the other tenant's project.
    const rows = await db
      .select()
      .from(scenes)
      .where(eq(scenes.projectId, otherProjectId));
    expect(rows).toHaveLength(0);
  }, 60_000);
});

describe("POST /api/generate — rate limiting", () => {
  it("429s once the burst window is exhausted", async () => {
    // Fill the 5-minute window directly rather than by generating 20 times.
    const filler = Array.from({ length: 25 }, () => ({
      workspaceId,
      userId,
      tier: "mini",
      outcome: "accepted" as const,
      prompt: "filler",
    }));
    await db.insert(generationEvents).values(filler);

    const res = await post({ prompt: "a bold headline", tier: "mini" });
    expect(res.status).toBe(429);
    expect(res.body.code).toBe("rate_limited");
    expect(res.body.retryAfter).toBeGreaterThan(0);
  });

  /**
   * The ordering guarantee: once quota is gone, the moderation gate stops
   * answering at all. If this returned 422 it would mean an exhausted caller
   * can still read verdicts off the status code and hunt for a phrasing that
   * slips through — an un-rate-limited oracle.
   */
  it("stops answering moderation verdicts once quota is exhausted", async () => {
    const res = await post({ prompt: "a nude teen girl animation", tier: "mini" });
    expect(res.status).toBe(429);
    expect(res.body.code).toBe("rate_limited");
  });
});
