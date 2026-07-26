/**
 * The single generation façade (spec §9). Callers never branch on provider —
 * they call generate(modelId, request) and get the same envelope back for every
 * tier. Access/credit checks happen OUTSIDE this function (server route), not here.
 */
import { getModel } from "./models";
import { generateMini } from "./providers/local";
import type { GenerationEnvelope, GenerationRequest } from "./types";

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
      // Paid tiers are wired at Milestone 7 (RAG few-shot + validation/retry).
      throw new Error(
        `Provider "${model.provider}" (${model.id}) is not wired until Milestone 7`,
      );
  }
}
