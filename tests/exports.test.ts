import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, sql } from "drizzle-orm";
import request from "supertest";

import { createApp } from "@/app";
import { signSession } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { projects, scenes, users, workspaces } from "@/lib/db/schema";
import { provisionNewUser } from "@/lib/auth/provision";

const app = createApp();

let freeToken: string;
let proToken: string;
let freeUserId: string;
let proUserId: string;
let proSceneId: string;
let freeSceneId: string;

async function makeUser(tier: "free" | "pro") {
  const [u] = await db
    .insert(users)
    .values({ email: `export-${tier}-${crypto.randomUUID()}@example.test` })
    .returning({ id: users.id });
  const { workspaceId } = await provisionNewUser(u.id, "Export Test");
  if (tier !== "free") {
    await db
      .update(workspaces)
      .set({ subscriptionTier: tier })
      .where(eq(workspaces.id, workspaceId));
  }
  const [p] = await db
    .insert(projects)
    .values({ workspaceId, name: "P" })
    .returning({ id: projects.id });
  const [s] = await db
    .insert(scenes)
    .values({
      projectId: p.id,
      durationInFrames: 60,
      fps: 60,
      code: "export default function S(){return null;}",
      params: [],
      prompt: "test",
      modelId: "default",
    })
    .returning({ id: scenes.id });
  return { userId: u.id, sceneId: s.id, token: signSession(u.id) };
}

beforeAll(async () => {
  const free = await makeUser("free");
  const pro = await makeUser("pro");
  freeUserId = free.userId;
  freeSceneId = free.sceneId;
  freeToken = free.token;
  proUserId = pro.userId;
  proSceneId = pro.sceneId;
  proToken = pro.token;
});

afterAll(async () => {
  await db.delete(users).where(eq(users.id, freeUserId));
  await db.delete(users).where(eq(users.id, proUserId));
});

describe("POST /api/exports — gating", () => {
  it("401s without a session", async () => {
    const res = await request(app)
      .post("/api/exports")
      .send({ sceneId: proSceneId, format: "mp4" });
    expect(res.status).toBe(401);
  });

  it("403s the free tier with tier_locked", async () => {
    const res = await request(app)
      .post("/api/exports")
      .set("authorization", `Bearer ${freeToken}`)
      .send({ sceneId: freeSceneId, format: "mp4" });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("tier_locked");
  });

  it("400s an unsupported format (mov is deliberately not offered)", async () => {
    const res = await request(app)
      .post("/api/exports")
      .set("authorization", `Bearer ${proToken}`)
      .send({ sceneId: proSceneId, format: "mov" });
    expect(res.status).toBe(400);
  });

  it("404s a scene from another workspace (IDOR)", async () => {
    const res = await request(app)
      .post("/api/exports")
      .set("authorization", `Bearer ${proToken}`)
      .send({ sceneId: freeSceneId, format: "mp4" });
    expect(res.status).toBe(404);
  });
});

describe("export lifecycle (worker not running)", () => {
  let exportId: string;

  it("queues an export for a paid plan", async () => {
    const res = await request(app)
      .post("/api/exports")
      .set("authorization", `Bearer ${proToken}`)
      .send({ sceneId: proSceneId, format: "webm", quality: "fast" });
    expect(res.status).toBe(202);
    expect(res.body.ok).toBe(true);
    exportId = res.body.id;
  });

  it("reports queued status to the owner", async () => {
    const res = await request(app)
      .get(`/api/exports/${exportId}`)
      .set("authorization", `Bearer ${proToken}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("queued");
    expect(res.body.format).toBe("webm");
  });

  it("hides the export from other users (IDOR)", async () => {
    const res = await request(app)
      .get(`/api/exports/${exportId}`)
      .set("authorization", `Bearer ${freeToken}`);
    expect(res.status).toBe(404);
  });

  it("409s a download before the render is done", async () => {
    const res = await request(app)
      .get(`/api/exports/${exportId}/download`)
      .set("authorization", `Bearer ${proToken}`);
    expect(res.status).toBe(409);
  });

  it("serves the bytes once done", async () => {
    const bytes = Buffer.from("not-a-real-webm-but-bytes");
    await db.execute(
      sql`UPDATE exports SET status = 'done', file_data = ${bytes}, file_size = ${bytes.byteLength} WHERE id = ${exportId}`,
    );
    const res = await request(app)
      .get(`/api/exports/${exportId}/download`)
      .set("authorization", `Bearer ${proToken}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("video/webm");
    expect(res.headers["content-disposition"]).toContain("attachment");
    expect(res.body.length ?? res.body.byteLength).toBe(bytes.byteLength);
  });

  it("lists a scene's exports for the owner", async () => {
    const res = await request(app)
      .get(`/api/exports/scene/${proSceneId}/list`)
      .set("authorization", `Bearer ${proToken}`);
    expect(res.status).toBe(200);
    expect(res.body.exports.length).toBeGreaterThan(0);
    expect(res.body.exports[0].status).toBe("done");
  });
});
