/**
 * Provider-hint stripping (spec §5, requirement 6: "users can't tell which AI
 * we use from inspect").
 *
 * The model ladder is already server-only (`lib/ai/models.ts`) and the response
 * envelope never carries a modelId or provider — this module closes the last
 * hole: text the *model itself* authored. Paid tiers at M7 will happily emit
 * `// Generated with <vendor>` or name themselves in a reasoning string, and
 * that ships straight to the browser unless something scrubs it.
 *
 * TWO SURFACES, TREATED DIFFERENTLY — this distinction is the point:
 *
 *   - Model-authored text (comments, reasoning, notes) is scrubbed aggressively.
 *   - USER content is never touched. A prompt like "promo video for OpenAI" must
 *     put "OpenAI" on screen intact. Param values come from the user's own words
 *     via slot extraction, so blanket find-and-replace over the whole payload
 *     would corrupt legitimate work. Code is cleaned by removing comment ranges
 *     resolved from the AST, never by rewriting string literals.
 */
import { parse } from "@babel/parser";

/** Vendor and model-family names that identify the underlying provider. */
const VENDOR_TOKENS = [
  "anthropic", "claude", "sonnet", "opus", "haiku",
  "openai", "chatgpt", "gpt-4", "gpt-5", "gpt4", "gpt5", "o1-preview", "codex",
  "google ai", "gemini", "palm", "bard", "vertex ai",
  "openrouter", "mistral", "mixtral", "llama", "meta ai",
  "deepseek", "qwen", "grok", "x-ai", "cohere", "perplexity",
  "large language model", "language model", "llm",
];

const VENDOR_RE = new RegExp(
  `\\b(?:${VENDOR_TOKENS.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`,
  "gi",
);

/** `anthropic/claude-sonnet-4.6`, `google/gemini-3-pro`, … — the ladder's id shape. */
const MODEL_ID_RE =
  /\b(?:anthropic|openai|google|meta-llama|mistralai|deepseek|qwen|x-ai|cohere|perplexity)\/[a-z0-9.:_-]+/gi;

const NEUTRAL = "the model";

/**
 * Remove every comment from generated source.
 *
 * Comment ranges come from the parser, not a regex, so a `//` inside a string
 * literal is never mistaken for a comment. Comments carry no runtime meaning,
 * so dropping them wholesale is lossless — and it is the single biggest leak
 * vector, since a model that signs its work does it in a comment.
 *
 * Unparseable input is returned untouched: the validation gate rejects it a
 * moment later anyway, and a half-spliced string would only confuse the error.
 */
export function stripComments(code: string): string {
  let comments: Array<{ start?: number | null; end?: number | null }>;
  try {
    const ast = parse(code, { sourceType: "module", plugins: ["jsx", "typescript"] });
    comments = ast.comments ?? [];
  } catch {
    return code;
  }
  if (comments.length === 0) return code;

  // Splice back-to-front so earlier offsets stay valid.
  const ranges = comments
    .map((c) => [c.start ?? -1, c.end ?? -1] as const)
    .filter(([s, e]) => s >= 0 && e > s)
    .sort((a, b) => b[0] - a[0]);

  let out = code;
  for (const [start, end] of ranges) {
    out = out.slice(0, start) + out.slice(end);
  }

  // Collapse the blank lines the removal leaves behind.
  return out.replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n");
}

/** Scrub vendor names and model ids out of model-authored prose. */
export function sanitizeText(text: string): string {
  return text.replace(MODEL_ID_RE, NEUTRAL).replace(VENDOR_RE, NEUTRAL);
}

/** Same, but tolerant of undefined so callers can pipe optional fields through. */
export function sanitizeOptionalText(text?: string): string | undefined {
  return text === undefined ? undefined : sanitizeText(text);
}

/**
 * Clean generated component source before it leaves the server.
 * Comments go entirely; a bare model id anywhere else is neutralised as a
 * backstop (those ids never appear in legitimate motion code).
 */
export function sanitizeGeneratedCode(code: string): string {
  return stripComments(code).replace(MODEL_ID_RE, NEUTRAL);
}

/** Test/assertion helper: does this string still identify a provider? */
export function containsProviderHint(s: string): boolean {
  MODEL_ID_RE.lastIndex = 0;
  VENDOR_RE.lastIndex = 0;
  return MODEL_ID_RE.test(s) || VENDOR_RE.test(s);
}
