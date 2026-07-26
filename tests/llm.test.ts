import { describe, it, expect } from "vitest";

import {
  buildMessages,
  buildRepairMessages,
  parseEnvelope,
  LlmParseError,
  SYSTEM_PROMPT,
} from "@/lib/ai/llm";
import { generate } from "@/lib/ai/generate";
import { ALLOWED_IMPORTS } from "@/lib/motion/whitelist";

const VALID = {
  code: "import { AbsoluteFill } from 'remotion';\nexport default function S({ params }) { return null; }",
  params: [{ key: "text", label: "Text", type: "text", default: "Hi" }],
  durationInFrames: 120,
  fps: 60,
};

describe("parseEnvelope", () => {
  it("parses a bare JSON object", () => {
    const env = parseEnvelope(JSON.stringify(VALID));
    expect(env.code).toContain("export default");
    expect(env.durationInFrames).toBe(120);
    expect(env.fps).toBe(60);
  });

  it("strips markdown fences", () => {
    const env = parseEnvelope("```json\n" + JSON.stringify(VALID) + "\n```");
    expect(env.params).toHaveLength(1);
  });

  it("tolerates prose around the object", () => {
    const env = parseEnvelope(
      "Here is your animation:\n" + JSON.stringify(VALID) + "\nEnjoy!",
    );
    expect(env.code).toContain("AbsoluteFill");
  });

  it("defaults fps to 60 when omitted", () => {
    const { fps: _fps, ...rest } = VALID;
    expect(parseEnvelope(JSON.stringify(rest)).fps).toBe(60);
  });

  it("rejects output with no JSON at all", () => {
    expect(() => parseEnvelope("I cannot do that.")).toThrow(LlmParseError);
  });

  it("rejects a missing code field", () => {
    const { code: _code, ...rest } = VALID;
    expect(() => parseEnvelope(JSON.stringify(rest))).toThrow(LlmParseError);
  });

  it("rejects malformed param entries", () => {
    const bad = { ...VALID, params: [{ key: "x" }] };
    expect(() => parseEnvelope(JSON.stringify(bad))).toThrow(LlmParseError);
  });

  it("rejects a non-integer duration", () => {
    const bad = { ...VALID, durationInFrames: "long" };
    expect(() => parseEnvelope(JSON.stringify(bad))).toThrow(LlmParseError);
  });
});

describe("prompt construction", () => {
  it("the system prompt names exactly the whitelisted imports", () => {
    for (const imp of ALLOWED_IMPORTS) {
      expect(SYSTEM_PROMPT).toContain(`"${imp}"`);
    }
  });

  it("puts the user's prompt and exemplars in the user turn", () => {
    const msgs = buildMessages('a headline reading "Go"', []);
    expect(msgs[0].role).toBe("system");
    expect(msgs[1].role).toBe("user");
    expect(msgs[1].content).toContain('a headline reading "Go"');
  });

  it("repair messages append the invalid attempt and the errors", () => {
    const base = buildMessages("x", []);
    const msgs = buildRepairMessages(base, "{bad", ["import not allowed: fs"]);
    expect(msgs).toHaveLength(base.length + 2);
    expect(msgs.at(-2)?.role).toBe("assistant");
    expect(msgs.at(-1)?.content).toContain("import not allowed: fs");
  });
});

describe("generate() without provider keys", () => {
  // vitest.setup strips OPENROUTER_API_KEY / GEMINI_API_KEY, so every paid
  // tier must fail with the marker the route maps to a clean, unbilled 501.
  it("throws the not-configured marker for every paid tier", async () => {
    for (const id of [
      "gemini-2.5-flash",
      "anthropic/claude-sonnet-5",
      "anthropic/claude-opus-5",
    ]) {
      await expect(generate(id, { prompt: "a bold headline" })).rejects.toThrow(
        /not configured/i,
      );
    }
  });
});
