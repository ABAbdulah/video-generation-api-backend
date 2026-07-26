/**
 * The client-safe half of the AI contract.
 *
 * WHY THIS FILE EXISTS (spec §5): `lib/ai/models.ts` is `server-only` because it
 * holds real model ids and provider names. Client components still need the
 * vocabulary to talk to the server — the tier union, the public model DTO, the
 * shape of a generate response — so those live here, where importing them is
 * safe. `models.ts` imports FROM this file, never the reverse.
 *
 * RULE: nothing in this file may ever name a vendor, a model id, or a provider.
 * If a value here would let someone infer which AI runs behind a tier, it
 * belongs in models.ts instead.
 */
import type { ParamSchema } from "@/lib/templates/types";

export type Tier = "mini" | "starter" | "best" | "pro";
export type SubscriptionTier = "free" | "beginner" | "pro";

/** What the UI is allowed to know about a rung of the ladder: no id, no provider. */
export interface PublicModel {
  tier: Tier;
  label: string;
  description: string;
  creditCost: number;
  requiredSubscriptionTier: SubscriptionTier;
}

/** Machine-readable failure codes, so the UI branches on these, not on prose. */
export type GenerateErrorCode =
  | "unauthorized"
  | "invalid_body"
  | "no_workspace"
  | "moderation"
  | "rate_limited"
  | "tier_locked"
  | "insufficient_credits"
  | "not_available"
  /** Upstream capacity/billing problem on our side — retrying won't help. */
  | "tier_unavailable"
  | "generation_failed";

export interface GeneratedScene {
  sceneId: string;
  versionId: string;
  projectId: string;
  code: string;
  params: ParamSchema[];
  durationInFrames: number;
  fps: number;
}

export interface GenerateSuccess {
  ok: true;
  scene: GeneratedScene;
  /** Echoed back so the UI can label the result — tier, never a model id. */
  tier: Tier;
  label: string;
  creditsCharged: number;
  /** Ledger balance after this generation, so the UI needn't refetch. */
  balance: number;
  /** Set when the free tier fell back below its confidence threshold. */
  note?: string;
  source?: "template-fill" | "closest-fallback";
}

export interface GenerateFailure {
  ok: false;
  code: GenerateErrorCode;
  error: string;
  /** Only on rate_limited — seconds until the caller may retry. */
  retryAfter?: number;
}

export type GenerateResponse = GenerateSuccess | GenerateFailure;

/** Max prompt length accepted by POST /api/generate. Shared so the textarea
 *  enforces exactly what the server enforces. */
export const MAX_PROMPT_LENGTH = 2000;
