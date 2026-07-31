import { z } from "zod";
import { handler, parseBody } from "@/server/http";
import { requireUser } from "@/server/auth";
import { loadMessages, loadOwnedBuild } from "@/server/builds";
import {
  createEscalation,
  listEscalations,
  TRANSCRIPT_TURNS,
  type EscalationRecord,
} from "@/server/escalations";
import { consume } from "@/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ buildId: string }> };

/** The owner's handoff list, newest first. */
export function GET(_request: Request, { params }: Params) {
  return handler<{ escalations: EscalationRecord[] }>(async () => {
    const user = await requireUser();
    const { buildId } = await params;
    await loadOwnedBuild(user.id, buildId); // ownership check
    return { escalations: await listEscalations(buildId) };
  });
}

const Body = z.object({
  reason: z.string().trim().max(500).optional(),
});

/**
 * Records a handoff from the builder's own chat.
 *
 * The transcript is read from the database here rather than accepted from the
 * request. The client already has the messages on screen, so posting them would
 * be one fewer query — but then the record would say whatever the caller typed
 * into it, and a tamperable audit record is worth less than no record at all.
 */
export function POST(request: Request, { params }: Params) {
  return handler<{ escalation: EscalationRecord }>(async () => {
    const user = await requireUser();
    const { buildId } = await params;
    consume("write", user.id);

    const { reason } = await parseBody(request, Body);
    await loadOwnedBuild(user.id, buildId); // ownership check

    const messages = await loadMessages(buildId, "agent");

    const escalation = await createEscalation({
      buildId,
      reason,
      transcript: messages
        .slice(-TRANSCRIPT_TURNS)
        .map((message) => ({ role: message.role, content: message.content })),
      source: "owner",
    });

    return { escalation };
  });
}
