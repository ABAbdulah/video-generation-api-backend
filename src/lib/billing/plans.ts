/**
 * The paid plan catalog.
 *
 * Prices are display-only — the real amount lives on the Polar product, so a
 * price change there can't be contradicted by a stale string here. What this
 * file owns is the mapping from OUR subscription tier to a Polar product id,
 * and the copy the upgrade dialog renders.
 */
import type { SubscriptionTier } from "@/lib/ai/contract";

export type PaidTier = Exclude<SubscriptionTier, "free">;

export interface Plan {
  tier: PaidTier;
  name: string;
  /** Display price, e.g. "$12". The charge itself comes from Polar. */
  price: string;
  cadence: string;
  features: string[];
  /** Polar product id — absent until the env var is set. */
  productId?: string;
}

export function getPlans(): Plan[] {
  return [
    {
      tier: "beginner",
      name: "Creator",
      price: "$12",
      cadence: "per month",
      features: [
        "Unlock the Best quality tier",
        "Export MP4, WebM and GIF",
        "300 credits every month",
        "Full template library",
      ],
      productId: process.env.POLAR_PRODUCT_BEGINNER,
    },
    {
      tier: "pro",
      name: "Studio",
      price: "$39",
      cadence: "per month",
      features: [
        "Everything in Creator",
        "Unlock the Pro quality tier",
        "1,200 credits every month",
        "Priority rendering",
      ],
      productId: process.env.POLAR_PRODUCT_PRO,
    },
  ];
}

export function getPlan(tier: string): Plan | undefined {
  return getPlans().find((p) => p.tier === tier);
}

/** Credits granted when a plan activates or renews. */
export const PLAN_CREDIT_GRANT: Record<PaidTier, number> = {
  beginner: 300,
  pro: 1200,
};
