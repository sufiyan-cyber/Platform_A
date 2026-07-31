import { z } from "zod";
import { handler, parseBody } from "@/server/http";
import { requireUser } from "@/server/auth";
import {
  appendMessage,
  campaignForBuild,
  getChatSessionId,
  loadMessages,
  loadOwnedBuild,
  type StoredMessage,
} from "@/server/builds";
import { chatWithAgent } from "@/server/lyzr";
import { groundMessage } from "@/server/grounding";
import { consume } from "@/server/rate-limit";
import { AppError } from "@/lib/api-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { params: Promise<{ buildId: string }> };

/** Transcript, so a refresh mid-conversation doesn't wipe it. */
export function GET(_request: Request, { params }: Params) {
  return handler<{ messages: StoredMessage[] }>(async () => {
    const user = await requireUser();
    const { buildId } = await params;
    await loadOwnedBuild(user.id, buildId); // ownership check
    return { messages: await loadMessages(buildId, "agent") };
  });
}

const Body = z.object({ message: z.string().trim().min(1).max(4000) });

/**
 * One turn with the agent the developer built.
 *
 * Both halves of the turn are persisted only after the upstream call succeeds.
 * Writing the user's message first would leave an orphan in the transcript on
 * failure, and the client — which rolls its optimistic echo back and restores
 * the draft — would then duplicate it on retry.
 *
 * When the campaign declares `retrieval`, a web search runs first and its
 * results are injected ahead of the message. The *original* text is what gets
 * persisted and echoed back, not the composed one — the sources block is
 * plumbing, and showing it in the transcript would make the developer's own
 * message unreadable. The citations travel on the reply instead.
 */
export function POST(request: Request, { params }: Params) {
  return handler<{ user: StoredMessage; reply: StoredMessage }>(async () => {
    const user = await requireUser();
    const { buildId } = await params;
    consume("chat", user.id);

    const { message } = await parseBody(request, Body);
    const build = await loadOwnedBuild(user.id, buildId);

    if (!build.agent) {
      throw new AppError("conflict", "This agent hasn't been launched yet.", { retryable: false });
    }

    const campaign = campaignForBuild(build);
    const grounding = await groundMessage({ campaign, message, identity: user.id });

    const sessionId = await getChatSessionId(buildId);
    const { reply } = await chatWithAgent({
      agentId: build.agent.id,
      message: grounding.message,
      sessionId,
      userId: user.id,
    });

    const stored = await appendMessage({
      buildId,
      channel: "agent",
      role: "user",
      content: message,
    });
    const storedReply = await appendMessage({
      buildId,
      channel: "agent",
      role: "assistant",
      content: reply,
      meta:
        grounding.status === "off"
          ? undefined
          : { sources: grounding.sources, grounding: grounding.status },
    });

    return { user: stored, reply: storedReply };
  });
}
