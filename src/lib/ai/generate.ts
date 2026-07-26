/**
 * The single generation façade (spec §9). Callers never branch on provider —
 * they call generate(modelId, request) and get the same envelope back for every
 * tier. Access/credit checks happen OUTSIDE this function (server route), not here.
 *
 * Paid tiers (Milestone 7):
 *   1. RAG few-shot — retrieveTemplates() supplies the top-k corpus entries as
 *      exemplars, so the model imitates known-good code and format.
 *   2. Provider call — gemini-direct or openrouter. When Starter's Gemini key
 *      is absent but an OpenRouter key exists, Starter transparently routes
 *      through OpenRouter under the equivalent "google/<id>" model. A tier with
 *      no usable key throws NotConfiguredError, which the route maps to the
 *      same clean 501 as the pre-M7 not-wired state.
 *   3. Validation + one repair pass (Milestone 8) — the output is validated
 *      HERE, and an invalid attempt is fed back to the model once with the
 *      validator's errors. Still invalid after that → the error propagates and
 *      the route refuses without billing. The route's own validate call then
 *      re-checks whatever we return (defense in depth, and it covers Mini too).
 */
import { getModel, type AiModel } from "./models";
import { generateMini } from "./providers/local";
import {
  callOpenRouter,
  openRouterConfigured,
} from "./providers/openrouter";
import { callGemini, geminiConfigured } from "./providers/gemini";
import { NotConfiguredError } from "./providers/errors";
import {
  buildMessages,
  buildRepairMessages,
  parseEnvelope,
  LlmParseError,
  type ChatMessage,
} from "./llm";
import { retrieveTemplates } from "@/lib/templates/retrieval";
import { validateTemplateCode } from "@/lib/templates/validate";
import type { GenerationEnvelope, GenerationRequest } from "./types";

/** How many corpus exemplars ride along as few-shot context. */
const RAG_K = 3;

export async function generate(
  modelId: string,
  req: GenerationRequest,
): Promise<GenerationEnvelope> {
  const model = getModel(modelId);
  if (!model) throw new Error(`Unknown model: ${modelId}`);

  switch (model.provider) {
    case "local":
      return generateMini(req.prompt);
    case "gemini-direct":
    case "openrouter":
      return generateLlm(model, req);
  }
}

/** Dispatch one chat to the model's provider (with the Starter fallback). */
async function complete(model: AiModel, messages: ChatMessage[]): Promise<string> {
  if (model.provider === "gemini-direct") {
    if (geminiConfigured()) return callGemini(model.id, messages);
    // Key-less Starter rides the OpenRouter key if there is one — same model,
    // different gateway ("gemini-2.5-flash" → "google/gemini-2.5-flash").
    if (openRouterConfigured()) {
      return callOpenRouter(`google/${model.id}`, messages);
    }
    throw new NotConfiguredError("API key not configured for this tier");
  }
  return callOpenRouter(model.id, messages);
}

async function generateLlm(
  model: AiModel,
  req: GenerationRequest,
): Promise<GenerationEnvelope> {
  // RAG few-shot. Retrieval failures (e.g. an unseeded database) degrade to
  // zero-shot rather than failing the generation outright.
  let exemplars: Awaited<ReturnType<typeof retrieveTemplates>> = [];
  try {
    exemplars = await retrieveTemplates(req.prompt, { k: RAG_K });
  } catch {
    exemplars = [];
  }

  const messages = buildMessages(req.prompt, exemplars);
  const raw = await complete(model, messages);

  // Attempt 1: parse + validate.
  let firstErrors: string[];
  try {
    const envelope = parseEnvelope(raw);
    const validation = validateTemplateCode(
      envelope.code,
      envelope.params,
      envelope.durationInFrames,
    );
    if (validation.ok) return envelope;
    firstErrors = validation.errors;
  } catch (e) {
    if (!(e instanceof LlmParseError)) throw e;
    firstErrors = [e.message];
  }

  // Attempt 2 (M8): one scoped repair pass with the errors fed back.
  const repaired = await complete(
    model,
    buildRepairMessages(messages, raw, firstErrors),
  );
  const envelope = parseEnvelope(repaired); // a second parse failure propagates
  const validation = validateTemplateCode(
    envelope.code,
    envelope.params,
    envelope.durationInFrames,
  );
  if (!validation.ok) {
    // Surfaced to the route as a generation failure — refused, never billed.
    throw new Error(
      `Generated code failed validation after repair: ${validation.errors.join("; ")}`,
    );
  }
  return envelope;
}
