import { z } from "zod";
import { handler, parseBody } from "@/server/http";
import { requireUser } from "@/server/auth";
import {
  campaignForBuild,
  completeMission,
  loadOwnedBuild,
  saveDecision,
  saveProgress,
  type BuildState,
} from "@/server/builds";
import { analyzeAgentSource, SOURCE_MAX_CHARS } from "@/lib/agent-source";
import { isMissionComplete, isStage } from "@/lib/flow";
import { consume } from "@/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ buildId: string }> };

const Body = z.object({
  text: z.string().max(SOURCE_MAX_CHARS, "That file is too large to save."),
  stage: z.string().optional(),
  elapsedMs: z.number().int().nonnegative().max(1000 * 60 * 60 * 24).optional(),
});

/**
 * Saves the whole agent file at once — the editor's counterpart to
 * `PUT /decisions`, which saves one answer at a time.
 *
 * Two properties make this safe to point at the same build the guided flow
 * writes to:
 *
 *   • It re-parses and re-validates here. The editor shows diagnostics as you
 *     type, but that is a courtesy; this is the authority, running the campaign's
 *     own rules, exactly as the single-decision route does.
 *   • It is a *partial* save by design. Valid fields are written and invalid
 *     ones are reported back, because refusing the whole file over one bad field
 *     is how an editor loses an hour of somebody's work. Nothing invalid ever
 *     reaches the build, so assembly at launch is unaffected either way.
 *
 * XP is banked here too, for exactly the missions whose steps now all validate —
 * server-checked and idempotent via `completeMission`, so a developer who works
 * in the editor earns the same progress as one who works through the screens,
 * and re-saving the same file awards nothing twice.
 */
export function PUT(request: Request, { params }: Params) {
  return handler<{
    build: BuildState;
    saved: string[];
    invalid: Record<string, string>;
    awarded: { missionId: string; xp: number }[];
  }>(async () => {
    const user = await requireUser();
    const { buildId } = await params;
    consume("write", user.id);

    const body = await parseBody(request, Body);
    const build = await loadOwnedBuild(user.id, buildId);
    const campaign = campaignForBuild(build);

    const analysis = analyzeAgentSource(campaign, body.text);

    // Sequential rather than concurrent: these are upserts on one build's rows,
    // and a burst of parallel writes buys nothing on a request that already
    // returns in a few milliseconds.
    const saved: string[] = [];
    for (const [stepId, value] of Object.entries(analysis.values)) {
      await saveDecision({ buildId, stepId, value });
      saved.push(stepId);
    }

    if (body.stage !== undefined || body.elapsedMs !== undefined) {
      await saveProgress({
        buildId,
        ...(body.stage !== undefined && isStage(body.stage) ? { stage: body.stage } : {}),
        ...(body.elapsedMs !== undefined ? { elapsedMs: body.elapsedMs } : {}),
      });
    }

    // Re-read rather than merging in memory: the missions below are judged on
    // what is actually persisted, which is the same standard the guided flow's
    // XP route holds itself to.
    const after = await loadOwnedBuild(user.id, buildId);

    const awarded: { missionId: string; xp: number }[] = [];
    for (const mission of campaign.missions) {
      if (after.completedMissionIds.includes(mission.id)) continue;
      if (!isMissionComplete(campaign, mission.id, after.decisions)) continue;

      const result = await completeMission({ buildId, missionId: mission.id, xp: mission.xp });
      if (result.awarded > 0) awarded.push({ missionId: mission.id, xp: result.awarded });
    }

    return {
      build: awarded.length > 0 ? await loadOwnedBuild(user.id, buildId) : after,
      saved,
      invalid: analysis.invalid,
      awarded,
    };
  });
}
