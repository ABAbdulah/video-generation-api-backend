/**
 * The Mini tier — the zero-cost free tier, and the most important subsystem.
 *
 * Makes NO paid LLM call. Pipeline:
 *   1. retrieve the nearest template by vector similarity
 *   2. if confident, extract slots from the prompt and fill the template params
 *   3. otherwise return the nearest template as-is with an honest note
 *   4. validate the resulting code before returning (defence in depth)
 *
 * Output is always valid because it was never free-form generated.
 */
import { retrieveTemplates } from "@/lib/templates/retrieval";
import { validateTemplateCode } from "@/lib/templates/validate";
import { extractSlots } from "../slots";
import { fillParams } from "../params";
import type { MiniResult } from "../types";

/**
 * Confidence cutoff. Tuned for the offline feature-hash embedding, where a few
 * shared words land around 0.3–0.6 and unrelated prompts near 0. Real Gemini
 * embeddings score much higher; this threshold stays safe for both.
 */
export const MINI_SIMILARITY_THRESHOLD = 0.15;

export async function generateMini(prompt: string): Promise<MiniResult> {
  const matches = await retrieveTemplates(prompt, { k: 3 });
  if (matches.length === 0) {
    throw new Error(
      "No embedded templates found — run `pnpm embed:templates` first.",
    );
  }

  const best = matches[0];
  const confident = best.similarity >= MINI_SIMILARITY_THRESHOLD;

  const params = confident
    ? fillParams(best.params, extractSlots(prompt, best.fps))
    : best.params;

  const envelope = {
    code: best.code,
    durationInFrames: best.durationInFrames,
    fps: best.fps,
    params,
  };

  // Should always pass (seed code is pre-validated), but never ship unchecked.
  const v = validateTemplateCode(
    envelope.code,
    envelope.params,
    envelope.durationInFrames,
  );
  if (!v.ok) {
    throw new Error(
      `Mini produced invalid output for "${best.slug}": ${v.errors.join("; ")}`,
    );
  }

  return {
    ...envelope,
    source: confident ? "template-fill" : "closest-fallback",
    templateSlug: best.slug,
    similarity: best.similarity,
    reasoning: `Matched template "${best.title}" (similarity ${best.similarity.toFixed(3)})`,
    note: confident
      ? undefined
      : `No close template match for this prompt — returning the nearest one ("${best.title}"). A paid tier will do better here.`,
  };
}
