import { z } from "zod";
import { handler, parseBody } from "@/server/http";
import { requireUser } from "@/server/auth";
import {
  appendMessage,
  campaignForBuild,
  loadMessages,
  loadOwnedBuild,
  type StoredMessage,
} from "@/server/builds";
import { askMentor } from "@/server/mentor";
import { consume } from "@/server/rate-limit";
import { findStep, findMissionForStep, missionById } from "@/campaigns/types";
import { isStage } from "@/lib/flow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { params: Promise<{ buildId: string }> };

export function GET(_request: Request, { params }: Params) {
  return handler<{ messages: StoredMessage[] }>(async () => {
    const user = await requireUser();
    const { buildId } = await params;
    await loadOwnedBuild(user.id, buildId);
    return { messages: await loadMessages(buildId, "mentor") };
  });
}

const Body = z.object({
  message: z.string().trim().min(1).max(2000),
  /** Where the developer is right now — the client knows, the server verifies. */
  stage: z.string(),
  missionId: z.string().optional(),
  stepId: z.string().optional(),
});

/**
 * One Mentor turn.
 *
 * The context block is assembled *server-side* from the persisted build rather
 * than trusted from the request: the client says which screen it's on, and the
 * server looks up what that means and what has actually been decided.
 */
export function POST(request: Request, { params }: Params) {
  return handler<{ user: StoredMessage; reply: StoredMessage }>(async () => {
    const user = await requireUser();
    const { buildId } = await params;
    consume("mentor", user.id);

    const body = await parseBody(request, Body);
    const build = await loadOwnedBuild(user.id, buildId);
    const campaign = campaignForBuild(build);

    const step = body.stepId ? findStep(campaign, body.stepId) : undefined;
    const mission =
      (body.missionId ? missionById(campaign, body.missionId) : undefined) ??
      (body.stepId ? findMissionForStep(campaign, body.stepId) : undefined);

    // Persisted only once the mentor has actually answered — a failed turn
    // leaves no orphan in the transcript for the client to duplicate on retry.
    const reply = await askMentor({
      buildId,
      userId: user.id,
      message: body.message,
      context: {
        campaign,
        stage: isStage(body.stage) ? body.stage : "mission",
        mission,
        step,
        decisions: build.decisions,
      },
    });

    const stored = await appendMessage({
      buildId,
      channel: "mentor",
      role: "user",
      content: body.message,
    });
    const storedReply = await appendMessage({
      buildId,
      channel: "mentor",
      role: "assistant",
      content: reply,
    });

    return { user: stored, reply: storedReply };
  });
}
