import { describe, it, expect } from "vitest";
import { SEED_TEMPLATES } from "@/lib/templates/seed";
import {
  validateTemplateCode,
  MIN_DURATION,
  MAX_DURATION,
} from "@/lib/templates/validate";
import type { TemplateCategory } from "@/lib/templates/types";

const ALL_CATEGORIES: TemplateCategory[] = [
  "text",
  "graphics",
  "overlays",
  "logos",
  "social",
  "charts-data",
  "money",
  "app-website",
  "ui-elements",
  "launch-videos",
];

describe("seed template corpus", () => {
  it("has enough templates to prove the loop", () => {
    expect(SEED_TEMPLATES.length).toBeGreaterThanOrEqual(12);
  });

  it("covers every category", () => {
    const present = new Set(SEED_TEMPLATES.map((t) => t.category));
    for (const c of ALL_CATEGORIES) {
      expect(present.has(c), `missing category: ${c}`).toBe(true);
    }
  });

  it("has unique slugs", () => {
    const slugs = SEED_TEMPLATES.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("keeps every duration within the sane range", () => {
    for (const t of SEED_TEMPLATES) {
      expect(t.durationInFrames).toBeGreaterThanOrEqual(MIN_DURATION);
      expect(t.durationInFrames).toBeLessThanOrEqual(MAX_DURATION);
    }
  });

  it.each(SEED_TEMPLATES.map((t) => [t.slug, t] as const))(
    "%s passes the validation gate",
    (_slug, t) => {
      const result = validateTemplateCode(t.code, t.params, t.durationInFrames);
      expect(result.errors).toEqual([]);
      expect(result.ok).toBe(true);
    },
  );
});

describe("validation gate rejects bad code", () => {
  const goodParams = [
    { key: "text", label: "Text", type: "text" as const, default: "hi" },
  ];
  const goodCode = `
import { AbsoluteFill } from 'remotion';
export default function C({ params }) {
  const { text } = params;
  return <AbsoluteFill>{text}</AbsoluteFill>;
}`;

  it("accepts a minimal valid component", () => {
    expect(validateTemplateCode(goodCode, goodParams, 120).ok).toBe(true);
  });

  it("rejects a disallowed import", () => {
    const code = goodCode.replace(
      "import { AbsoluteFill } from 'remotion';",
      "import { AbsoluteFill } from 'remotion';\nimport axios from 'axios';",
    );
    const r = validateTemplateCode(code, goodParams, 120);
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/disallowed import.*axios/);
  });

  it("rejects forbidden globals", () => {
    const code = `
import { AbsoluteFill } from 'remotion';
export default function C({ params }) {
  const { text } = params;
  fetch('/x');
  return <AbsoluteFill>{text}</AbsoluteFill>;
}`;
    const r = validateTemplateCode(code, goodParams, 120);
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/forbidden global.*fetch/);
  });

  it("rejects a missing default export", () => {
    const code = `
import { AbsoluteFill } from 'remotion';
export function C({ params }) {
  const { text } = params;
  return <AbsoluteFill>{text}</AbsoluteFill>;
}`;
    const r = validateTemplateCode(code, goodParams, 120);
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/no default export/);
  });

  it("rejects a declared param that is never read", () => {
    const r = validateTemplateCode(
      goodCode,
      [...goodParams, { key: "unused", label: "Unused", type: "text", default: "x" }],
      120,
    );
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/param "unused".*never read/);
  });

  it("rejects an out-of-range duration", () => {
    expect(validateTemplateCode(goodCode, goodParams, 5).ok).toBe(false);
    expect(validateTemplateCode(goodCode, goodParams, 99999).ok).toBe(false);
  });

  it("rejects unparseable code", () => {
    const r = validateTemplateCode("export default function (", goodParams, 120);
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/parse error/);
  });
});
