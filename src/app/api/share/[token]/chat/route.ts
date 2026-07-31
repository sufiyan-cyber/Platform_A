import { z } from "zod";
import { handler, parseBody } from "@/server/http";
import {
  bookShareChatTurn,
  loadShareChatTarget,
  refundShareChatTurn,
} from "@/server/share";
import { chatWithAgent } from "@/server/lyzr";
import { groundMessage, type GroundingStatus } from "@/server/grounding";
import { getCampaign } from "@/campaigns";
import type { SearchSource } from "@/server/search";
import { consume } from "@/server/rate-limit";
import { AppError } from "@/lib/api-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { params: Promise<{ token: string }> };

/**
 * One turn with a *shared* agent. The only unauthenticated route in the app that
 * can spend money, so it's the one with the most guards:
 *
 *   1. The token must resolve to a launched build whose owner has replies on.
 *   2. Per-IP token bucket, so one visitor can't hammer it.
 *   3. A per-link lifetime budget, booked before the upstream call and refunded
 *      if that call fails — a flaky agent service costs the owner nothing.
 *
 * Visitor messages are deliberately **not persisted**. The owner shared a demo,
 * not a mailbox, and storing strangers' conversations would mean holding data
 * nobody consented to. Multi-turn memory still works: it lives in the Lyzr
 * session id the visitor's browser holds for the length of the visit.
 */

const Body = z.object({
  message: z.string().trim().min(1).max(2000),
  /**
   * Opaque per-visitor id, generated in the browser and kept for the tab's
   * lifetime. Constrained to a safe alphabet and namespaced with the token
   * below, so the worst a tampered value can do is join its own conversation.
   */
  visitorId: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{8,64}$/, "Invalid session id."),
});

export function POST(request: Request, { params }: Params) {
  return handler<{
    reply: string;
    remaining: number;
    sources: SearchSource[];
    grounding: GroundingStatus;
  }>(async () => {
    const { token } = await params;

    const ip = clientIp(request);
    consume("shareChat", ip);

    const { message, visitorId } = await parseBody(request, Body);
    const target = await loadShareChatTarget(token);

    const campaign = getCampaign(target.campaignId);
    if (!campaign) {
      throw new AppError("not_found", "This share link isn't valid any more.", {
        retryable: false,
      });
    }

    // Grounding runs before the budget is booked: a search that fails costs the
    // owner nothing, and one that succeeds shouldn't hold a booked turn open
    // for the two seconds it takes. Keyed by IP, like the chat limit above.
    const grounding = await groundMessage({ campaign, message, identity: ip });

    await bookShareChatTurn(target.buildId);

    try {
      const { reply } = await chatWithAgent({
        agentId: target.agentId,
        message: grounding.message,
        // Namespaced so two visitors never land in the same conversation, and
        // so a shared session can't collide with the owner's own `build-…` one.
        sessionId: `share-${token}-${visitorId}`,
        userId: target.ownerId,
      });
      return {
        reply,
        remaining: target.remaining - 1,
        sources: grounding.sources,
        grounding: grounding.status,
      };
    } catch (error) {
      await refundShareChatTurn(target.buildId);
      throw error;
    }
  });
}

/**
 * Best-effort client address for rate limiting.
 *
 * Behind a proxy that doesn't set these headers, every visitor collapses into
 * one bucket — which fails *closed* (shared, stricter limit) rather than open.
 */
function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}
