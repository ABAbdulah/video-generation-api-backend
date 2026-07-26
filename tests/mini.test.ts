import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { templates } from "@/lib/db/schema";
import { embed } from "@/lib/ai/embeddings";
import { SEED_TEMPLATES } from "@/lib/templates/seed";
import { extractSlots } from "@/lib/ai/slots";
import { fillParams, paramsToValues } from "@/lib/ai/params";
import { generateMini } from "@/lib/ai/providers/local";
import { generate } from "@/lib/ai/generate";
import { validateTemplateCode } from "@/lib/templates/validate";

beforeAll(async () => {
  for (const t of SEED_TEMPLATES) {
    const vec = await embed(`${t.title}\n${t.prompt}`, "RETRIEVAL_DOCUMENT");
    await db
      .update(templates)
      .set({ embedding: vec })
      .where(eq(templates.slug, t.slug));
  }
}, 60_000);

describe("slot extraction", () => {
  it("pulls hex and named colours in order", () => {
    const s = extractSlots("make it #FF0000 with a blue accent");
    expect(s.colors).toContain("#ff0000");
    expect(s.colors).toContain("#3b82f6");
  });

  it("expands shorthand hex", () => {
    expect(extractSlots("use #0f0").colors).toContain("#00ff00");
  });

  it("reads durations in seconds and frames", () => {
    expect(extractSlots("make it 3 seconds long", 60).durationFrames).toBe(180);
    expect(extractSlots("90 frames please").durationFrames).toBe(90);
  });

  it("captures quoted text", () => {
    expect(extractSlots('headline reading "Ship Faster"').text).toBe(
      "Ship Faster",
    );
  });

  it("captures standalone numbers without leaking hex digits", () => {
    const s = extractSlots("a 3 by 5 grid in #112233");
    expect(s.numbers).toEqual([3, 5]);
  });
});

describe("fillParams", () => {
  it("overrides defaults positionally by type and clamps numbers", () => {
    const schema = [
      { key: "headline", label: "H", type: "text" as const, default: "old" },
      { key: "c1", label: "c1", type: "color" as const, default: "#000000" },
      { key: "n", label: "n", type: "number" as const, default: 3, min: 1, max: 4 },
    ];
    const filled = fillParams(schema, {
      colors: ["#ffffff"],
      numbers: [999],
      text: "new",
    });
    const values = paramsToValues(filled);
    expect(values.headline).toBe("new");
    expect(values.c1).toBe("#ffffff");
    expect(values.n).toBe(4); // clamped to max
  });
});

describe("generateMini", () => {
  it("returns a validated envelope for a matching prompt", async () => {
    const r = await generateMini("a bold headline that rises into view");
    expect(r.source).toBe("template-fill");
    expect(r.similarity).toBeGreaterThan(0);
    expect(validateTemplateCode(r.code, r.params, r.durationInFrames).ok).toBe(
      true,
    );
  });

  it("applies extracted slots to the returned params", async () => {
    const r = await generateMini('a headline reading "Ship It" in #ff0000');
    const values = paramsToValues(r.params);
    // kinetic-headline's first text param is `headline`
    expect(Object.values(values)).toContain("Ship It");
    expect(Object.values(values)).toContain("#ff0000");
  });

  it("falls back honestly when nothing matches", async () => {
    const r = await generateMini("zzxqwff pldoob gharnak wibble");
    expect(r.source).toBe("closest-fallback");
    expect(r.note).toBeTruthy();
    // still a valid, renderable envelope
    expect(validateTemplateCode(r.code, r.params, r.durationInFrames).ok).toBe(
      true,
    );
  });
});

describe("generate() façade", () => {
  it("routes the Mini model to the local tier", async () => {
    const r = await generate("default", { prompt: "kinetic headline" });
    expect(r.code).toContain("export default");
    expect(r.fps).toBeGreaterThan(0);
  });

  it("throws for unknown models", async () => {
    await expect(generate("nope/nope", { prompt: "x" })).rejects.toThrow(
      /Unknown model/,
    );
  });

  it("defers paid providers to M7", async () => {
    await expect(
      generate("anthropic/claude-sonnet-4.6", { prompt: "x" }),
    ).rejects.toThrow(/Milestone 7/);
  });
});
