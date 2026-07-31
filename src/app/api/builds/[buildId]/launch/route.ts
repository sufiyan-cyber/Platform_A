import { z } from "zod";
import { handler, parseBody } from "@/server/http";
import { requireUser } from "@/server/auth";
import {
  campaignForBuild,
  getChatSessionId,
  loadOwnedBuild,
  recordLaunch,
  renameAgent,
  type BuildState,
} from "@/server/builds";
import { assembleAgentPayload, type LyzrAgentPayload } from "@/lib/assemble";
import { createAgent } from "@/server/lyzr";
import { consume } from "@/server/rate-limit";
import { AppError } from "@/lib/api-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Agent creation can legitimately take a while; don't let the platform cut it off. */
export const maxDuration = 60;

type Params = { params: Promise<{ buildId: string }> };

const Body = z.object({
  /** Set when re-launching after a tweak — creates a fresh agent. */
  rebuild: z.boolean().optional(),
});

/**
 * The payoff. Assembles every decision into a Lyzr config, creates the real
 * agent, and stores its id.
 *
 * Ordering is deliberate: assembly (and therefore full re-validation) happens
 * *before* the network call, so an incomplete build fails instantly and for
 * free rather than after a 30-second round trip.
 */
export function POST(request: Request, { params }: Params) {
  return handler<{ build: BuildState; payload: LyzrAgentPayload }>(async () => {
    const user = await requireUser();
    const { buildId } = await params;
    const body = await parseBody(request, Body);

    const build = await loadOwnedBuild(user.id, buildId);
    const campaign = campaignForBuild(build);

    // Already launched and not explicitly rebuilding → return what exists.
    // Makes the finale safe to double-click and safe to refresh into.
    if (build.agent && !body.rebuild) {
      if (!build.launchPayload) {
        throw new AppError("internal", "This build is launched but its config is missing.");
      }
      return { build, payload: build.launchPayload };
    }

    consume("launch", user.id);

    // Throws `invalid_input` with per-step detail if anything is missing.
    const payload = assembleAgentPayload(campaign, build.decisions);

    const { agentId } = await createAgent(payload);
    const chatSessionId = `build-${buildId}-${Date.now()}`;

    await recordLaunch({
      buildId,
      agentId,
      agentName: payload.name,
      payload,
      chatSessionId,
    });

    return { build: await loadOwnedBuild(user.id, buildId), payload };
  });
}

const RenameBody = z.object({ name: z.string().trim().min(2).max(60) });

/** Renames the built agent locally (display only — Lyzr keeps its own name). */
export function PATCH(request: Request, { params }: Params) {
  return handler<{ build: BuildState }>(async () => {
    const user = await requireUser();
    const { buildId } = await params;
    const { name } = await parseBody(request, RenameBody);

    const build = await loadOwnedBuild(user.id, buildId);
    if (!build.agent) {
      throw new AppError("conflict", "There's no agent to rename yet.", { retryable: false });
    }

    await renameAgent(buildId, name);
    await getChatSessionId(buildId);
    return { build: await loadOwnedBuild(user.id, buildId) };
  });
}
