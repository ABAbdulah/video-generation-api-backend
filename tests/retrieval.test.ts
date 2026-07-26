import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { templates } from "@/lib/db/schema";
import { embed } from "@/lib/ai/embeddings";
import { SEED_TEMPLATES } from "@/lib/templates/seed";
import { retrieveTemplates } from "@/lib/templates/retrieval";

// Ensure every seed template has an embedding under the CURRENT provider
// (offline in CI, Gemini if a key is present). Idempotent.
beforeAll(async () => {
  for (const t of SEED_TEMPLATES) {
    const vec = await embed(`${t.title}\n${t.prompt}`, "RETRIEVAL_DOCUMENT");
    await db
      .update(templates)
      .set({ embedding: vec })
      .where(eq(templates.slug, t.slug));
  }
}, 60_000);

describe("template retrieval (pgvector)", () => {
  it("returns k results ordered by descending similarity", async () => {
    const results = await retrieveTemplates("a headline that animates in", {
      k: 3,
    });
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].similarity).toBeGreaterThanOrEqual(
        results[i].similarity,
      );
    }
  });

  it.each([
    ["a bold headline that rises into view", "kinetic-headline"],
    ["animated bar chart with growing bars", "bar-chart"],
    ["a big number counting down to launch", "launch-countdown"],
    ["morph a square shape into a diamond", "morph-shape"],
    ["a price counting up in dollars", "price-counter"],
  ])("retrieves the expected template for %j", async (query, expectedSlug) => {
    const results = await retrieveTemplates(query, { k: 3 });
    const slugs = results.map((r) => r.slug);
    expect(slugs).toContain(expectedSlug);
  });

  it("returns full template payload needed by the Mini tier", async () => {
    const [top] = await retrieveTemplates("kinetic headline", { k: 1 });
    expect(top.code).toContain("export default");
    expect(Array.isArray(top.params)).toBe(true);
    expect(top.durationInFrames).toBeGreaterThan(0);
    expect(top.fps).toBeGreaterThan(0);
  });
});
