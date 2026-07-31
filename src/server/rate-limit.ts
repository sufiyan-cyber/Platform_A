import "server-only";
import { AppError } from "@/lib/api-error";

/**
 * In-process token bucket, keyed per user per operation.
 *
 * Scope note: this protects a single server instance, which is the right size
 * for the thing it guards — our own outbound spend on the agent service and one
 * developer hammering the retry button. It is intentionally *not* a distributed
 * limiter; behind multiple instances, move `buckets` to Redis and keep this
 * exact interface.
 */

type Bucket = { tokens: number; lastRefill: number };

const buckets = new Map<string, Bucket>();

export type LimitConfig = {
  /** Bucket size — the largest burst allowed. */
  capacity: number;
  /** Tokens added per second. */
  refillPerSecond: number;
};

/** Agent-backed surfaces are the expensive ones; everything else is generous. */
export const LIMITS = {
  chat: { capacity: 8, refillPerSecond: 0.25 }, // ~1 every 4s sustained, burst of 8
  mentor: { capacity: 6, refillPerSecond: 0.2 },
  launch: { capacity: 3, refillPerSecond: 0.05 }, // creating agents is rare and costly
  write: { capacity: 60, refillPerSecond: 2 }, // saving decisions must never feel gated
  /**
   * Visitor chat on a public share link, keyed by IP rather than user id — the
   * caller is anonymous by definition. Tighter than the owner's own limit
   * because this one is reachable by anybody with the URL. The link's lifetime
   * cap in src/server/share.ts is the other half of this defence: this bounds
   * the rate, that bounds the total.
   */
  // Event-tuned: a room full of people on one NAT'd wifi IP all land in the
  // SAME bucket, so the original 4 / 0.1 gave a whole audience one message
  // every ten seconds between them. Raised for live demos; the per-link
  // lifetime cap is what actually protects the key.
  shareChat: { capacity: 12, refillPerSecond: 0.5 }, // ~1 every 2s sustained, burst of 12
  /**
   * Web search, consumed once per grounded chat turn — so it sits *behind*
   * `chat`/`shareChat` and only ever trips when those are still letting turns
   * through. Deliberately generous relative to them: exhausting this bucket
   * doesn't fail the turn, it degrades it to an ungrounded answer that says so
   * (see src/server/grounding.ts), and a silent downgrade is worse than a
   * slightly larger search bill.
   */
  search: { capacity: 20, refillPerSecond: 0.5 },
  /**
   * Handoffs from a public share link, keyed by IP. Costs no upstream money, so
   * this isn't about spend — it bounds how fast an anonymous caller can write
   * rows into someone else's escalation list. Tight on purpose: asking for a
   * human is a deliberate act, and nobody does it four times in a minute
   * legitimately. The per-build lifetime cap in src/server/escalations.ts is the
   * other half, and the half that survives a process restart.
   */
  escalate: { capacity: 4, refillPerSecond: 0.05 },
} satisfies Record<string, LimitConfig>;

export type LimitName = keyof typeof LIMITS;

/**
 * Consumes one token or throws a 429 carrying a human wait time.
 * Never blocks — the caller gets an immediate, actionable answer.
 */
export function consume(name: LimitName, identity: string): void {
  const config = LIMITS[name];
  const key = `${name}:${identity}`;
  const now = Date.now();

  const bucket = buckets.get(key) ?? { tokens: config.capacity, lastRefill: now };

  const elapsedSeconds = (now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(config.capacity, bucket.tokens + elapsedSeconds * config.refillPerSecond);
  bucket.lastRefill = now;

  if (bucket.tokens < 1) {
    const waitSeconds = Math.ceil((1 - bucket.tokens) / config.refillPerSecond);
    buckets.set(key, bucket);
    throw new AppError(
      "rate_limited",
      `You're going faster than the agent service allows. Try again in ${waitSeconds}s — nothing was lost.`,
    );
  }

  bucket.tokens -= 1;
  buckets.set(key, bucket);

  // Opportunistic sweep so a long-lived process doesn't accumulate dead keys.
  if (buckets.size > 5_000) pruneStale(now);
}

function pruneStale(now: number): void {
  for (const [key, bucket] of buckets) {
    if (now - bucket.lastRefill > 10 * 60 * 1000) buckets.delete(key);
  }
}

/** Test seam. */
export function __resetRateLimits(): void {
  buckets.clear();
}
