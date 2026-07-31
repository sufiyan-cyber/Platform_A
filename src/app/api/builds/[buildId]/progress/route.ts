import { z } from "zod";
import { handler, parseBody } from "@/server/http";
import { requireUser } from "@/server/auth";
import { completeMission, campaignForBuild, loadOwnedBuild, saveProgress } from "@/server/builds";
import { missionById } from "@/campaigns/types";
import { isMissionComplete, isStage } from "@/lib/flow";
import { AppError } from "@/lib/api-error";
import { consume } from "@/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ buildId: string }> };

const Body = z.object({
  stage: z.string().optional(),
  currentMissionId: z.string().nullable().optional(),
  elapsedMs: z.number().int().nonnegative().max(1000 * 60 * 60 * 24).optional(),
  /** Present when the client believes a mission just finished. */
  completeMissionId: z.string().optional(),
});

/**
 * Position, timer, and mission completion.
 *
 * XP is never taken from the client. When `completeMissionId` is present the
 * server re-checks that every step of that mission actually validates before
 * awarding anything, and `completeMission` makes the award idempotent — so a
 * double-click or a retried request can't farm XP.
 */
export function PATCH(request: Request, { params }: Params) {
  return handler<{
    xp: number;
    completedMissionIds: string[];
    awarded: number;
  }>(async () => {
    const user = await requireUser();
    const { buildId } = await params;
    consume("write", user.id);

    const body = await parseBody(request, Body);
    const build = await loadOwnedBuild(user.id, buildId);

    await saveProgress({
      buildId,
      ...(body.stage !== undefined && isStage(body.stage) ? { stage: body.stage } : {}),
      ...(body.currentMissionId !== undefined ? { currentMissionId: body.currentMissionId } : {}),
      ...(body.elapsedMs !== undefined ? { elapsedMs: body.elapsedMs } : {}),
    });

    if (!body.completeMissionId) {
      return {
        xp: build.xp,
        completedMissionIds: build.completedMissionIds,
        awarded: 0,
      };
    }

    const campaign = campaignForBuild(build);
    const mission = missionById(campaign, body.completeMissionId);
    if (!mission) {
      throw new AppError("not_found", "That mission isn't part of this campaign.", {
        retryable: false,
      });
    }

    if (!isMissionComplete(campaign, mission.id, build.decisions)) {
      throw new AppError(
        "invalid_input",
        "That mission still has unanswered steps — finish them and try again.",
        { retryable: false },
      );
    }

    return completeMission({ buildId, missionId: mission.id, xp: mission.xp });
  });
}
