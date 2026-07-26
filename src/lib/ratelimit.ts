/**
 * Per-workspace rate limiting for the generation route (spec §5, requirement 4).
 *
 * Backed by the `generation_events` table rather than an in-process Map, on
 * purpose: an in-memory counter resets on every Railway deploy and is per-replica,
 * so it stops being a limit the moment the service scales past one instance or
 * restarts — which is precisely when someone hammering the endpoint would notice.
 * The table already has to exist for abuse review, so this costs one indexed
 * COUNT against an index that covers it exactly.
 *
 * Two windows, both enforced: a short burst window and a longer daily ceiling.
 * The burst window stops a script; the daily ceiling stops a slow drip.
 */
import { and, eq, gte, sql } from "drizzle-orm";
import type { Db, Tx } from "@/lib/db";
import { generationEvents } from "@/lib/db/schema";

export interface RateWindow {
  /** Window length in seconds. */
  seconds: number;
  /** Max attempts permitted within the window. */
  max: number;
  label: string;
}

/**
 * Applies to attempts, not successes — a rejected prompt still consumes quota,
 * otherwise the moderation gate itself becomes a free oracle to probe.
 */
export const GENERATION_WINDOWS: RateWindow[] = [
  { seconds: 5 * 60, max: 20, label: "5 minutes" },
  { seconds: 24 * 60 * 60, max: 200, label: "24 hours" },
];

export interface RateLimitResult {
  ok: boolean;
  /** Seconds the caller should wait before retrying. Only set when !ok. */
  retryAfter?: number;
  /** Which window tripped. Only set when !ok. */
  window?: RateWindow;
  /** Remaining attempts in the tightest window. */
  remaining: number;
}

async function countSince(
  dbx: Db | Tx,
  workspaceId: string,
  since: Date,
): Promise<number> {
  const [row] = await dbx
    .select({ n: sql<number>`count(*)::int` })
    .from(generationEvents)
    .where(
      and(
        eq(generationEvents.workspaceId, workspaceId),
        gte(generationEvents.createdAt, since),
      ),
    );
  return row?.n ?? 0;
}

/**
 * Check (do not consume) the workspace's quota. The route records an event for
 * every attempt anyway, and that row IS the consumption — so there is no
 * separate increment to get out of sync with it.
 */
export async function checkGenerationRateLimit(
  dbx: Db | Tx,
  workspaceId: string,
  now: Date = new Date(),
): Promise<RateLimitResult> {
  let tightestRemaining = Number.POSITIVE_INFINITY;

  for (const window of GENERATION_WINDOWS) {
    const since = new Date(now.getTime() - window.seconds * 1000);
    const used = await countSince(dbx, workspaceId, since);
    const remaining = window.max - used;

    if (remaining <= 0) {
      return {
        ok: false,
        window,
        // Without per-row timestamps to hand we can't compute the exact moment
        // the oldest attempt ages out, so quote the full window — conservative,
        // and never tells the caller to retry into another rejection.
        retryAfter: window.seconds,
        remaining: 0,
      };
    }
    tightestRemaining = Math.min(tightestRemaining, remaining);
  }

  return { ok: true, remaining: tightestRemaining };
}
