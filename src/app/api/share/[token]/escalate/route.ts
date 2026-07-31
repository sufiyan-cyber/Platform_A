import { z } from "zod";
import { handler, parseBody } from "@/server/http";
import { loadShareEscalationTarget } from "@/server/share";
import { createEscalation, TRANSCRIPT_TURNS } from "@/server/escalations";
import { consume } from "@/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string }> };

/**
 * A handoff requested by a visitor on a public share link.
 *
 * This is the second unauthenticated write in the app, and unlike visitor chat
 * it *does* persist what a stranger sent us — so the shape is pinned tightly
 * here rather than trusted. The transcript has to come from the request because
 * visitor conversations are deliberately never stored (see the note on the chat
 * route); the person asking for a human is consenting to hand over the turns
 * that led there, and nothing beyond them is kept.
 *
 * The response deliberately carries no record id or count. A visitor learns that
 * their request landed and nothing about the owner's other handoffs.
 */
const Body = z.object({
  reason: z.string().trim().max(500).optional(),
  transcript: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(2_000),
      }),
    )
    .max(TRANSCRIPT_TURNS)
    .default([]),
});

export function POST(request: Request, { params }: Params) {
  return handler<{ ok: true }>(async () => {
    const { token } = await params;

    consume("escalate", clientIp(request));

    const { reason, transcript } = await parseBody(request, Body);
    const target = await loadShareEscalationTarget(token);

    await createEscalation({
      buildId: target.buildId,
      reason,
      transcript,
      source: "visitor",
    });

    return { ok: true };
  });
}

/** Same best-effort address resolution as the visitor chat route. */
function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}
