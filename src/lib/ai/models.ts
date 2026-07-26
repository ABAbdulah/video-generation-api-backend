/**
 * SERVER ONLY — see the security note on `PublicModel` below.
 *
 * This entire repo is the backend; nothing here is ever bundled for a browser.
 * The boundary that used to be enforced by `import "server-only"` in the
 * monorepo is now enforced by the repo split itself: the frontend repo has no
 * copy of this file and only ever sees `PublicModel[]` over HTTP.
 */
import type { PublicModel, SubscriptionTier, Tier } from "./contract";

// Re-exported for server-side callers that already import from here.
// Client components must import these from "./contract" instead.
export type { PublicModel, SubscriptionTier, Tier };

/** Server-only: naming a provider is exactly what §5 keeps out of the browser. */
export type Provider = "local" | "gemini-direct" | "openrouter";

export interface AiModel {
  id: string;
  label: string;
  tier: Tier;
  description: string;
  creditCost: number;
  requiredSubscriptionTier: SubscriptionTier;
  provider: Provider;
  requiresAdmin?: boolean;
}

/**
 * The model ladder (spec §2).
 *
 * IDs verified 2026-07-26 against the live https://openrouter.ai/api/v1/models
 * catalog (Best/Pro) and Google AI (Starter). Starter's id is in Google AI
 * format (no "google/" prefix); when it falls back to OpenRouter because only
 * OPENROUTER_API_KEY is configured, the façade prefixes it (see generate.ts).
 * `gemini-embedding-001` (embeddings) is separately verified and in use.
 */
export const AI_MODELS: AiModel[] = [
  {
    id: "default",
    label: "Mini",
    tier: "mini",
    description: "Fast code generation (FREE)",
    creditCost: 0,
    requiredSubscriptionTier: "free",
    provider: "local",
  },
  {
    id: "gemini-2.5-flash",
    label: "Starter",
    tier: "starter",
    description: "Fast & affordable",
    creditCost: 1,
    requiredSubscriptionTier: "free",
    provider: "gemini-direct",
  },
  {
    id: "anthropic/claude-sonnet-5",
    label: "Best",
    tier: "best",
    description: "Highest quality output",
    creditCost: 5,
    requiredSubscriptionTier: "beginner",
    provider: "openrouter",
  },
  {
    id: "anthropic/claude-opus-5",
    label: "Pro",
    tier: "pro",
    description: "Premium model",
    creditCost: 8,
    requiredSubscriptionTier: "pro",
    provider: "openrouter",
  },
];

const RANK: Record<SubscriptionTier, number> = { free: 0, beginner: 1, pro: 2 };

export function getModel(modelId: string): AiModel | undefined {
  return AI_MODELS.find((m) => m.id === modelId);
}

/**
 * SECURITY (spec: "users can't tell which AI we use from inspect").
 *
 * `AiModel.id` and `.provider` reveal the underlying vendor/model
 * (e.g. "anthropic/claude-sonnet-4.6", "openrouter"). Those MUST NEVER reach the
 * browser bundle. Enforce two rules:
 *   1. Client components NEVER import `AI_MODELS` / `AiModel` (the value). They
 *      receive `PublicModel[]` as props from a server component, or via an API
 *      route that returns `getPublicModels()`.
 *   2. The server picks the tier by `tier`/`label`; it resolves the real model
 *      id server-side. The client sends a `tier`, never a model id.
 *
 * Both rules are now ENFORCED, not just documented: the `import "server-only"`
 * at the top of this file fails the build if a Client Component reaches it, and
 * the client-safe vocabulary (`Tier`, `PublicModel`, the response contract)
 * lives in `./contract`, which client code imports instead.
 */
export function toPublicModel(m: AiModel): PublicModel {
  return {
    tier: m.tier,
    label: m.label,
    description: m.description,
    creditCost: m.creditCost,
    requiredSubscriptionTier: m.requiredSubscriptionTier,
  };
}

/** Client-safe model list: no `id`, no `provider`. Hand this to the UI. */
export function getPublicModels(): PublicModel[] {
  return AI_MODELS.filter((m) => !m.requiresAdmin).map(toPublicModel);
}

/** Resolve a user-supplied tier to the real model id — SERVER-SIDE ONLY. */
export function resolveModelIdByTier(tier: Tier): string | undefined {
  return AI_MODELS.find((m) => m.tier === tier && !m.requiresAdmin)?.id;
}

/** The full ladder entry for a tier — SERVER-SIDE ONLY (carries id + provider). */
export function getModelByTier(tier: Tier): AiModel | undefined {
  return AI_MODELS.find((m) => m.tier === tier && !m.requiresAdmin);
}

export function isModelAccessible(
  modelId: string,
  sub: SubscriptionTier,
): boolean {
  const m = getModel(modelId);
  return !!m && RANK[sub] >= RANK[m.requiredSubscriptionTier];
}
