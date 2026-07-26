import { describe, it, expect } from "vitest";
import { localEmbed, EMBEDDING_DIM } from "@/lib/ai/embeddings";

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // both are L2-normalized
}

describe("offline embedding (feature hashing)", () => {
  it("produces a normalized vector of the right dimension", () => {
    const v = localEmbed("animate the netflix logo");
    expect(v).toHaveLength(EMBEDDING_DIM);
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 6);
  });

  it("is deterministic", () => {
    expect(localEmbed("upward trend of github stars")).toEqual(
      localEmbed("upward trend of github stars"),
    );
  });

  it("scores shared-word texts higher than unrelated ones", () => {
    const q = localEmbed("a bold headline that rises into view");
    const related = localEmbed("a bold headline rises and fades in");
    const unrelated = localEmbed("morphing square into a diamond shape");
    expect(cosine(q, related)).toBeGreaterThan(cosine(q, unrelated));
  });

  it("handles empty / tokenless input without NaN", () => {
    const v = localEmbed("");
    expect(v.every((x) => Number.isFinite(x))).toBe(true);
  });
});
