/**
 * Billing: plan catalog, Polar checkout, and the webhook that actually grants
 * a plan.
 *
 * TRUST RULE: a workspace is upgraded ONLY by a signature-verified webhook
 * from Polar. Nothing the browser sends can change a subscription tier — the
 * checkout endpoint just mints a payment link. The success redirect is a UX
 * convenience and is never treated as proof of payment.
 */
import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { users, workspaces } from "@/lib/db/schema";
import { requireAuth } from "@/middleware/auth";
import { getUserWorkspace } from "@/lib/workspace";
import { grantCredits } from "@/lib/credits/ledger";
import { getPlan, getPlans, PLAN_CREDIT_GRANT, type PaidTier } from "@/lib/billing/plans";
import { polarClient, polarConfigured, polarServer } from "@/lib/billing/polar";

export const billingRouter = Router();

/** Public: what the upgrade dialog renders. Never exposes product ids. */
billingRouter.get("/plans", (_req, res) => {
  res.json({
    ok: true,
    // The dialog shows a "billing not set up" state instead of a dead button
    // when the server has no Polar credentials.
    configured: polarConfigured(),
    sandbox: polarServer() === "sandbox",
    plans: getPlans().map(({ productId: _p, ...plan }) => ({
      ...plan,
      available: !!_p,
    })),
  });
});

const checkoutSchema = z.object({
  plan: z.enum(["beginner", "pro"]),
  /** Where Polar sends the customer back to. Same-origin paths only. */
  returnPath: z.string().max(200).optional(),
});

billingRouter.post("/checkout", requireAuth, async (req, res) => {
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, code: "invalid_body", error: "Validation failed" });
    return;
  }
  if (!polarConfigured()) {
    res.status(503).json({
      ok: false,
      code: "billing_unavailable",
      error: "Checkout isn't set up yet. Please try again later.",
    });
    return;
  }

  const plan = getPlan(parsed.data.plan);
  if (!plan?.productId) {
    res.status(503).json({
      ok: false,
      code: "billing_unavailable",
      error: "That plan isn't available for purchase yet.",
    });
    return;
  }

  const workspace = await getUserWorkspace(req.userId!);
  if (!workspace) {
    res.status(403).json({ ok: false, code: "no_workspace", error: "No workspace found." });
    return;
  }
  const user = await db.query.users.findFirst({
    where: eq(users.id, req.userId!),
    columns: { email: true },
  });

  // Only ever build the return URL from OUR configured origin — never from
  // client input, which would make this an open redirect.
  const origin = (process.env.FRONTEND_ORIGIN ?? "http://localhost:3000").split(",")[0].trim();
  const path = parsed.data.returnPath?.startsWith("/") ? parsed.data.returnPath : "/editor";

  try {
    const checkout = await polarClient().checkouts.create({
      products: [plan.productId],
      successUrl: `${origin}${path}?upgraded=1`,
      customerEmail: user?.email,
      externalCustomerId: req.userId!,
      // The webhook reads these back to decide who to upgrade, and to what.
      metadata: { workspaceId: workspace.id, tier: plan.tier },
    });
    res.json({ ok: true, url: checkout.url });
  } catch (e) {
    console.error("[billing] checkout failed:", (e as Error).message);
    res.status(502).json({
      ok: false,
      code: "checkout_failed",
      error: "Could not start checkout. Please try again.",
    });
  }
});

/**
 * Polar webhook. Mounted with a RAW body parser (see app.ts) because the
 * signature is computed over the exact bytes — a re-serialized JSON body
 * fails verification.
 */
billingRouter.post("/webhook", async (req, res) => {
  const secret = process.env.POLAR_WEBHOOK_SECRET;
  if (!secret) {
    res.status(503).json({ error: "webhook not configured" });
    return;
  }

  const { validateEvent, WebhookVerificationError } = await import(
    "@polar-sh/sdk/webhooks.js"
  );

  let event;
  try {
    event = validateEvent(
      req.body as Buffer,
      req.headers as Record<string, string>,
      secret,
    );
  } catch (e) {
    if (e instanceof WebhookVerificationError) {
      res.status(403).json({ error: "invalid signature" });
      return;
    }
    throw e;
  }

  try {
    await applyEvent(event);
  } catch (e) {
    // Log and still 200: Polar retries on non-2xx, and a bug in our handler
    // shouldn't turn into an infinite redelivery loop. Failures are visible
    // in the service logs and the subscription can be reconciled by hand.
    console.error(`[billing] handling ${event.type} failed:`, (e as Error).message);
  }
  res.json({ received: true });
});

type PolarEvent = { type: string; data: Record<string, unknown> };

async function applyEvent(event: unknown): Promise<void> {
  const { type, data } = event as PolarEvent;

  const grantingEvents = ["subscription.active", "subscription.uncanceled", "order.paid"];
  const revokingEvents = ["subscription.revoked", "subscription.canceled"];

  if (!grantingEvents.includes(type) && !revokingEvents.includes(type)) return;

  const workspaceId = readMetadata(data, "workspaceId");
  if (!workspaceId) {
    console.warn(`[billing] ${type} carried no workspaceId; ignoring`);
    return;
  }

  if (revokingEvents.includes(type)) {
    await db
      .update(workspaces)
      .set({ subscriptionTier: "free" })
      .where(eq(workspaces.id, workspaceId));
    console.log(`[billing] workspace ${workspaceId} downgraded to free (${type})`);
    return;
  }

  const tier = readMetadata(data, "tier");
  if (tier !== "beginner" && tier !== "pro") {
    console.warn(`[billing] ${type} carried unknown tier "${tier}"; ignoring`);
    return;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(workspaces)
      .set({ subscriptionTier: tier })
      .where(eq(workspaces.id, workspaceId));
    await grantCredits(tx, {
      workspaceId,
      amount: PLAN_CREDIT_GRANT[tier as PaidTier],
      reason: "plan_grant",
    });
  });
  console.log(`[billing] workspace ${workspaceId} upgraded to ${tier} (${type})`);
}

/** Metadata rides on the subscription/order, or on its nested checkout. */
function readMetadata(data: Record<string, unknown>, key: string): string | undefined {
  const direct = (data.metadata as Record<string, unknown> | undefined)?.[key];
  if (typeof direct === "string") return direct;
  const nested = (
    (data.checkout as Record<string, unknown> | undefined)?.metadata as
      | Record<string, unknown>
      | undefined
  )?.[key];
  if (typeof nested === "string") return nested;
  const sub = (
    (data.subscription as Record<string, unknown> | undefined)?.metadata as
      | Record<string, unknown>
      | undefined
  )?.[key];
  return typeof sub === "string" ? sub : undefined;
}
