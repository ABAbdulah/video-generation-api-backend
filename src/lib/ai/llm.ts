/**
 * The paid-tier LLM layer (Milestone 7): prompt construction with RAG
 * few-shot exemplars, and strict parsing of the model's JSON envelope.
 *
 * Everything here is provider-agnostic — the provider clients in
 * providers/openrouter.ts and providers/gemini.ts only move messages over the
 * wire. Nothing in a prompt or a parse result ever reaches the client without
 * passing through sanitize.ts first (the route applies it), but we still keep
 * vendor names out of the prompt text we author: the model's output is
 * untrusted and gets persisted.
 */
import type { RetrievedTemplate } from "@/lib/templates/retrieval";
import { ALLOWED_IMPORTS } from "@/lib/motion/whitelist";
import { MIN_DURATION, MAX_DURATION } from "@/lib/templates/validate";
import type { GenerationEnvelope } from "./types";
import type { ParamSchema, ParamType } from "@/lib/templates/types";

/** A provider-neutral chat message. */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export const SYSTEM_PROMPT = `You are a senior motion designer who writes animation code. You produce broadcast-quality motion graphics as a single self-contained React component whose animation is a pure function of the current frame number.

HARD RULES — output that violates any of these is rejected by a static validator:
1. The module may import ONLY from: ${ALLOWED_IMPORTS.map((s) => `"${s}"`).join(", ")}. No other imports, no dynamic import, no require.
2. It must default-export a function component with the signature ({ params }) => JSX. Every tunable value (text, colors, sizes, timings) is read from \`params\`, never hardcoded.
3. Drive all motion from useCurrentFrame() (and useVideoConfig() for fps/duration/width/height). Never use setTimeout, setInterval, requestAnimationFrame, Math.random, Date, fetch, window, or document — renders must be deterministic.
4. durationInFrames must be an integer between ${MIN_DURATION} and ${MAX_DURATION}; use fps 60 unless the request demands otherwise. Design the canvas for 1920x1080.
5. TypeScript/TSX is allowed but keep it simple; the code is compiled with a TSX preset.

Available from "remotion": AbsoluteFill, Sequence, Img, useCurrentFrame, useVideoConfig, interpolate, spring, Easing, random.
Available from "@/lib/motion/primitives": springIn, fadeSlide, stagger, maskWipe, counter, progress, pathDraw, morph, pendulum, lightSweep — prefer these; they produce polished, settled motion.

PARAMS SCHEMA — alongside the code, author the control panel as an array of:
  { "key": string, "label": string, "type": "text"|"color"|"number"|"select"|"duration", "default": string|number, "min"?: number, "max"?: number, "step"?: number, "options"?: string[] }
Every params.KEY the code reads must have a matching schema entry, and defaults must make the scene look great as-is. Colors are hex strings. If the user specified exact text or colors, use them verbatim as the defaults.

CRAFT: ease in/out (never linear), stagger group entrances 3-8 frames apart, let motion settle before the scene ends, generous negative space, strong typographic hierarchy. The scene must read perfectly at a glance.

OUTPUT FORMAT — respond with EXACTLY one JSON object and nothing else (no markdown fences, no commentary):
{"code": "<the full module source>", "params": [...], "durationInFrames": <int>, "fps": 60}`;

/** Render one retrieved template as a few-shot exemplar. */
function exemplar(t: RetrievedTemplate, i: number): string {
  return `EXAMPLE ${i + 1} — "${t.title}":
${JSON.stringify({
    code: t.code,
    params: t.params,
    durationInFrames: t.durationInFrames,
    fps: t.fps,
  })}`;
}

/** Build the chat for a fresh generation: system + exemplars + the request. */
export function buildMessages(
  prompt: string,
  exemplars: RetrievedTemplate[],
): ChatMessage[] {
  const shots =
    exemplars.length > 0
      ? `Here are examples of the exact output format and code style, from the in-house library (closest matches to the request first):\n\n${exemplars
          .map(exemplar)
          .join("\n\n")}\n\n`
      : "";
  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `${shots}Create a motion graphic for this request:\n\n"${prompt}"\n\nRespond with the JSON object only.`,
    },
  ];
}

/**
 * The M8 repair pass: feed the invalid attempt and the validator's errors back
 * once. One scoped retry — a model that can't fix its own output on the second
 * try gets refused (and the user is never billed for it).
 */
export function buildRepairMessages(
  original: ChatMessage[],
  invalidRaw: string,
  errors: string[],
): ChatMessage[] {
  return [
    ...original,
    { role: "assistant", content: invalidRaw },
    {
      role: "user",
      content: `That output failed validation with these errors:\n${errors
        .map((e) => `- ${e}`)
        .join("\n")}\n\nFix every error and respond again with EXACTLY one JSON object in the required format — nothing else.`,
    },
  ];
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export class LlmParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmParseError";
  }
}

const PARAM_TYPES: ParamType[] = ["text", "color", "number", "select", "duration"];

function isParamSchema(p: unknown): p is ParamSchema {
  if (typeof p !== "object" || p === null) return false;
  const o = p as Record<string, unknown>;
  return (
    typeof o.key === "string" &&
    typeof o.label === "string" &&
    PARAM_TYPES.includes(o.type as ParamType) &&
    (typeof o.default === "string" || typeof o.default === "number")
  );
}

/**
 * Extract the generation envelope from raw model text. Tolerates markdown
 * fences and stray prose around the JSON (models add them despite
 * instructions), but is strict about the envelope's shape — anything
 * malformed throws LlmParseError, which the retry loop treats exactly like a
 * validation failure.
 */
export function parseEnvelope(raw: string): GenerationEnvelope {
  let text = raw.trim();

  // Strip a ```json ... ``` (or bare ```) fence if the model added one.
  const fence = text.match(/^```(?:json|tsx?|javascript)?\s*\n([\s\S]*?)\n```\s*$/);
  if (fence) text = fence[1].trim();

  // Fall back to the outermost { ... } span if there's prose around it.
  if (!text.startsWith("{")) {
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first === -1 || last <= first) {
      throw new LlmParseError("No JSON object found in model output");
    }
    text = text.slice(first, last + 1);
  }

  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch (e) {
    throw new LlmParseError(`Model output is not valid JSON: ${(e as Error).message}`);
  }

  if (typeof obj !== "object" || obj === null) {
    throw new LlmParseError("Model output is not a JSON object");
  }
  const o = obj as Record<string, unknown>;

  if (typeof o.code !== "string" || o.code.trim().length === 0) {
    throw new LlmParseError('Missing or empty "code" string');
  }
  if (!Array.isArray(o.params) || !o.params.every(isParamSchema)) {
    throw new LlmParseError('"params" must be an array of valid param schema entries');
  }
  const durationInFrames = Number(o.durationInFrames);
  if (!Number.isInteger(durationInFrames)) {
    throw new LlmParseError('"durationInFrames" must be an integer');
  }
  const fps = Number(o.fps ?? 60);
  if (!Number.isInteger(fps) || fps < 1 || fps > 120) {
    throw new LlmParseError('"fps" must be an integer between 1 and 120');
  }

  return {
    code: o.code,
    params: o.params as ParamSchema[],
    durationInFrames,
    fps,
  };
}
