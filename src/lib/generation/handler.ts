/**
 * The generation endpoint's logic — ported verbatim from the monorepo's
 * app/api/generate/route.ts. Framework-agnostic on purpose: it takes the
 * caller's userId (resolved by the auth middleware) and the raw body, and
 * returns { status, body }. The Express route and the tests both call this.
 *
 * Every security measure from spec §5 is applied here, in this order, because
 * the order is load-bearing:
 *
 *   1. auth            — no session, no endpoint
 *   2. zod             — including: the client sends a TIER, never a model id
 *   3. workspace       — resolved from the session, never from the body
 *   4. rate limit      — per workspace, counting attempts (not successes)
 *   5. moderation      — before any generation work touches the prompt
 *   6. tier gating     — subscription rank, server-side
 *   7. generate        — the façade; the server NEVER evals the result
 *   8. validate        — parse + import whitelist, before anything is persisted
 *   9. one transaction — scene + version + credit debit + event, atomically
 *  10. sanitize        — strip provider hints from everything leaving the server
 *
 * Rate limiting sits OUTSIDE moderation deliberately. Reversed, a caller who has
 * already burned their quota could still submit unlimited prompts and read the
 * moderation verdict off the status code — turning the gate into a free oracle
 * for finding phrasings that slip past it. The limiter has to bound every path
 * that does work, including the cheap ones.
 *
 * The debit lands INSIDE the transaction that inserts the scene, so a user is
 * never charged for a generation that failed to persist (the ledger's `Tx`
 * signature makes this structurally hard to get wrong — see lib/credits/ledger.ts).
 */
import { z } from "zod";

import { db } from "@/lib/db";
import { generationEvents, scenes, versions } from "@/lib/db/schema";
import {
  debitCredits,
  getBalance,
  InsufficientCreditsError,
} from "@/lib/credits/ledger";
import { generate } from "@/lib/ai/generate";
import { getModelByTier, isModelAccessible } from "@/lib/ai/models";
import { moderatePrompt } from "@/lib/ai/moderation";
import { ProviderUnavailableError } from "@/lib/ai/providers/errors";
import { sanitizeGeneratedCode, sanitizeOptionalText } from "@/lib/ai/sanitize";
import { checkGenerationRateLimit } from "@/lib/ratelimit";
import {
  assertProjectInWorkspace,
  getOrCreateDefaultProject,
  getUserWorkspace,
} from "@/lib/workspace";
import { validateTemplateCode } from "@/lib/templates/validate";
import { MAX_PROMPT_LENGTH } from "@/lib/ai/contract";
import type {
  GenerateFailure,
  GenerateResponse,
  GenerateSuccess,
  Tier,
} from "@/lib/ai/contract";
import type { MiniResult } from "@/lib/ai/types";
import type { ParamSchema } from "@/lib/templates/types";

export interface HandlerResult {
  status: number;
  body: GenerateResponse;
}

/**
 * `tier` is an enum of LABELS, not model ids — a client cannot name a model
 * even by guessing. `projectId` is verified against the caller's workspace
 * below; accepting it unchecked would be a straightforward IDOR.
 */
const generateSchema = z.object({
  prompt: z.string().trim().min(3).max(MAX_PROMPT_LENGTH),
  tier: z.enum(["mini", "starter", "best", "pro"]),
  projectId: z.string().min(1).max(64).optional(),
});

function fail(
  code: GenerateFailure["code"],
  error: string,
  status: number,
  extra: Partial<GenerateFailure> = {},
): HandlerResult {
  return { status, body: { ok: false, code, error, ...extra } };
}

/** Record an attempt. Never throws — telemetry must not break the response. */
async function recordEvent(args: {
  workspaceId: string;
  userId: string;
  tier: Tier;
  outcome: typeof generationEvents.$inferInsert.outcome;
  prompt: string;
  detail?: string;
}): Promise<void> {
  try {
    await db.insert(generationEvents).values(args);
  } catch {
    // Swallowed on purpose: a failed audit insert must not turn a successful
    // generation into a 500. Surfaced by the row simply being absent.
  }
}

export async function handleGenerate(
  userId: string | undefined,
  rawBody: unknown,
): Promise<HandlerResult> {
  // 1. auth
  if (!userId) {
    return fail("unauthorized", "You must be signed in to generate.", 401);
  }

  // 2. zod
  const parsed = generateSchema.safeParse(rawBody);
  if (!parsed.success) {
    return fail("invalid_body", "Validation failed", 400);
  }
  const { prompt, tier } = parsed.data;

  // 3. workspace — from the session, never the body
  const workspace = await getUserWorkspace(userId);
  if (!workspace) {
    return fail("no_workspace", "No workspace found for this account.", 403);
  }

  // 4. rate limit — the outer perimeter (see the ordering note above)
  const rate = await checkGenerationRateLimit(db, workspace.id);
  if (!rate.ok) {
    await recordEvent({
      workspaceId: workspace.id,
      userId,
      tier,
      outcome: "rejected_rate_limit",
      prompt,
      detail: rate.window?.label,
    });
    return fail(
      "rate_limited",
      `Too many generations. Try again in ${rate.window?.label ?? "a while"}.`,
      429,
      { retryAfter: rate.retryAfter },
    );
  }

  // 5. moderation
  const verdict = moderatePrompt(prompt);
  if (!verdict.ok) {
    await recordEvent({
      workspaceId: workspace.id,
      userId,
      tier,
      outcome: "rejected_moderation",
      prompt,
      detail: verdict.category,
    });
    return fail("moderation", verdict.reason ?? "This prompt was blocked.", 422);
  }

  // 6. tier gating — resolved server-side from the tier label
  const model = getModelByTier(tier);
  if (!model) {
    return fail("invalid_body", "Unknown tier.", 400);
  }
  if (!isModelAccessible(model.id, workspace.subscriptionTier)) {
    await recordEvent({
      workspaceId: workspace.id,
      userId,
      tier,
      outcome: "rejected_access",
      prompt,
      detail: `requires ${model.requiredSubscriptionTier}`,
    });
    return fail(
      "tier_locked",
      `This tier requires the ${model.requiredSubscriptionTier} plan.`,
      403,
    );
  }

  // 7. generate — the façade. Note the server never executes what comes back.
  let envelope;
  try {
    envelope = await generate(model.id, { prompt });
  } catch (e) {
    const message = (e as Error).message;
    // A tier whose provider key isn't configured is "not available", not a
    // server fault — and the message must not name the provider it mentions.
    // (Pre-M7 this same path covered the not-wired-yet stubs.)
    const notWired = /not wired until Milestone|not configured/i.test(message);
    const unavailable = e instanceof ProviderUnavailableError;

    if (unavailable) {
      await recordEvent({
        workspaceId: workspace.id,
        userId,
        tier,
        outcome: "failed",
        prompt,
        detail: `provider_unavailable: ${message}`.slice(0, 500),
      });
      return fail(
        "tier_unavailable",
        "This quality tier is temporarily unavailable. Try Mini or Starter, or check back shortly.",
        503,
      );
    }
    await recordEvent({
      workspaceId: workspace.id,
      userId,
      tier,
      outcome: "failed",
      prompt,
      detail: notWired ? "provider_not_wired" : message.slice(0, 500),
    });
    return notWired
      ? fail("not_available", "This tier isn't available yet.", 501)
      : fail("generation_failed", "Generation failed. Please try again.", 502);
  }

  // 8. validate before anything is persisted or charged for
  const validation = validateTemplateCode(
    envelope.code,
    envelope.params,
    envelope.durationInFrames,
  );
  if (!validation.ok) {
    await recordEvent({
      workspaceId: workspace.id,
      userId,
      tier,
      outcome: "failed",
      prompt,
      detail: `invalid_output: ${validation.errors.join("; ")}`.slice(0, 500),
    });
    // A validation retry loop lands at M8; today an invalid generation is simply
    // refused — and, critically, not billed.
    return fail("generation_failed", "Generation failed validation.", 502);
  }

  // 10 (applied before persistence so the stored code is clean too).
  const code = sanitizeGeneratedCode(envelope.code);
  const params = envelope.params as ParamSchema[];

  // 9. one transaction: project + scene + version + debit + event
  let persisted: { sceneId: string; versionId: string; projectId: string };
  try {
    persisted = await db.transaction(async (tx) => {
      let projectId = parsed.data.projectId;
      if (projectId) {
        const owned = await assertProjectInWorkspace(tx, projectId, workspace.id);
        if (!owned) throw new ProjectNotOwnedError();
      } else {
        projectId = await getOrCreateDefaultProject(tx, workspace.id);
      }

      const [scene] = await tx
        .insert(scenes)
        .values({
          projectId,
          durationInFrames: envelope.durationInFrames,
          fps: envelope.fps,
          code,
          params,
          prompt,
          // Stored server-side for support/analytics. Never returned to the
          // client — see the response envelope below.
          modelId: model.id,
        })
        .returning({ id: scenes.id });

      const [version] = await tx
        .insert(versions)
        .values({
          sceneId: scene.id,
          code,
          params,
          label: "Initial generation",
        })
        .returning({ id: versions.id });

      if (model.creditCost > 0) {
        await debitCredits(tx, {
          workspaceId: workspace.id,
          amount: model.creditCost,
          reason: "generation",
          modelId: model.id,
          sceneId: scene.id,
        });
      }

      await tx.insert(generationEvents).values({
        workspaceId: workspace.id,
        userId,
        tier,
        outcome: "accepted",
        prompt,
        sceneId: scene.id,
      });

      return { sceneId: scene.id, versionId: version.id, projectId };
    });
  } catch (e) {
    if (e instanceof InsufficientCreditsError) {
      await recordEvent({
        workspaceId: workspace.id,
        userId,
        tier,
        outcome: "rejected_credits",
        prompt,
        detail: `needs ${e.requested}, has ${e.balance}`,
      });
      return fail(
        "insufficient_credits",
        `Not enough credits: this costs ${e.requested}, you have ${e.balance}.`,
        402,
      );
    }
    if (e instanceof ProjectNotOwnedError) {
      return fail("invalid_body", "Unknown project.", 404);
    }
    await recordEvent({
      workspaceId: workspace.id,
      userId,
      tier,
      outcome: "failed",
      prompt,
      detail: `persist_failed: ${(e as Error).message}`.slice(0, 500),
    });
    return fail("generation_failed", "Could not save the generated scene.", 500);
  }

  const mini = envelope as Partial<MiniResult>;
  const balance = await getBalance(db, workspace.id);

  // 10. nothing below names a model, a provider, or a vendor.
  const success: GenerateSuccess = {
    ok: true,
    scene: {
      sceneId: persisted.sceneId,
      versionId: persisted.versionId,
      projectId: persisted.projectId,
      code,
      params,
      durationInFrames: envelope.durationInFrames,
      fps: envelope.fps,
    },
    tier,
    label: model.label,
    creditsCharged: model.creditCost,
    balance,
    note: sanitizeOptionalText(mini.note),
    source: mini.source,
  };
  return { status: 200, body: success };
}

/** Signals an IDOR attempt from inside the transaction so it rolls back. */
class ProjectNotOwnedError extends Error {
  constructor() {
    super("Project does not belong to this workspace");
    this.name = "ProjectNotOwnedError";
  }
}
