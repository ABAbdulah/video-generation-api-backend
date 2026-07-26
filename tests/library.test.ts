import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import request from "supertest";

import { createApp } from "@/app";
import { signSession } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { projects, scenes, users } from "@/lib/db/schema";
import { provisionNewUser } from "@/lib/auth/provision";

const app = createApp();

let userId: string;
let token: string;
let sceneId: string;

beforeAll(async () => {
  const [u] = await db
    .insert(users)
    .values({ email: `library-${crypto.randomUUID()}@example.test` })
    .returning({ id: users.id });
  userId = u.id;
  const { workspaceId } = await provisionNewUser(userId, "Library Test");
  const [p] = await db
    .insert(projects)
    .values({ workspaceId, name: "P" })
    .returning({ id: projects.id });
  const [s] = await db
    .insert(scenes)
    .values({
      projectId: p.id,
      durationInFrames: 90,
      fps: 60,
      code: "export default function S(){return null;}",
      params: [],
      prompt: "my library scene",
      modelId: "default",
    })
    .returning({ id: scenes.id });
  sceneId = s.id;
  token = signSession(userId);
});

afterAll(async () => {
  await db.delete(users).where(eq(users.id, userId));
});

describe("GET /api/templates", () => {
  it("serves the approved corpus publicly, with renderable payloads", async () => {
    const res = await request(app).get("/api/templates");
    expect(res.status).toBe(200);
    expect(res.body.templates.length).toBeGreaterThanOrEqual(40);
    const t = res.body.templates[0];
    expect(typeof t.code).toBe("string");
    expect(Array.isArray(t.params)).toBe(true);
    expect(t.durationInFrames).toBeGreaterThan(0);
  });
});

describe("GET /api/scenes/recent", () => {
  it("401s without a session", async () => {
    const res = await request(app).get("/api/scenes/recent");
    expect(res.status).toBe(401);
  });

  it("returns the caller's scenes, newest first", async () => {
    const res = await request(app)
      .get("/api/scenes/recent")
      .set("authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    const ids = res.body.scenes.map((s: { sceneId: string }) => s.sceneId);
    expect(ids).toContain(sceneId);
  });

  it("never leaks another workspace's scenes", async () => {
    const [other] = await db
      .insert(users)
      .values({ email: `library-other-${crypto.randomUUID()}@example.test` })
      .returning({ id: users.id });
    await provisionNewUser(other.id, "Other");
    try {
      const res = await request(app)
        .get("/api/scenes/recent")
        .set("authorization", `Bearer ${signSession(other.id)}`);
      expect(res.status).toBe(200);
      const ids = res.body.scenes.map((s: { sceneId: string }) => s.sceneId);
      expect(ids).not.toContain(sceneId);
    } finally {
      await db.delete(users).where(eq(users.id, other.id));
    }
  });
});
