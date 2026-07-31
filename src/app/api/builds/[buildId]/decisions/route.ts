import { z } from "zod";
import { handler, parseBody } from "@/server/http";
import { requireUser } from "@/server/auth";
import { campaignForBuild, loadOwnedBuild, saveDecision, saveProgress } from "@/server/builds";
import { findStep } from "@/campaigns/types";
import { validateStep } from "@/lib/validation";
import { AppError } from "@/lib/api-error";
import { consume } from "@/server/rate-limit";
import { isStage } from "@/lib/flow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ buildId: string }> };

const Body = z.object({
  stepId: z.string().min(1),
  value: z.union([z.string(), z.number()]),
  /** Optional position update, so a save and a navigation are one round trip. */
  stage: z.string().optional(),
  currentMissionId: z.string().nullable().optional(),
  elapsedMs: z.number().int().nonnegative().max(1000 * 60 * 60 * 24).optional(),
});

/**
 * Commits a single decision.
 *
 * The client validates as you type for instant feedback, but this is the
 * authority: the same campaign rule is re-run here against the raw value, so a
 * crafted request can't put an invalid decision into the build that later
 * assembles into a real agent.
 */
export function PUT(request: Request, { params }: Params) {
  return handler<{ stepId: string; value: string | number }>(async () => {
    const user = await requireUser();
    const { buildId } = await params;
    consume("write", user.id);

    const body = await parseBody(request, Body);
    const build = await loadOwnedBuild(user.id, buildId);
    const campaign = campaignForBuild(build);

    const step = findStep(campaign, body.stepId);
    if (!step) {
      throw new AppError("not_found", "That step isn't part of this campaign.", {
        retryable: false,
      });
    }

    const outcome = validateStep(step, body.value);
    if (!outcome.valid) {
      throw new AppError("invalid_input", outcome.message, {
        fields: { [body.stepId]: outcome.message },
        retryable: false,
      });
    }

    await saveDecision({ buildId, stepId: step.id, value: outcome.value });

    if (body.stage !== undefined || body.currentMissionId !== undefined || body.elapsedMs !== undefined) {
      await saveProgress({
        buildId,
        ...(body.stage !== undefined && isStage(body.stage) ? { stage: body.stage } : {}),
        ...(body.currentMissionId !== undefined ? { currentMissionId: body.currentMissionId } : {}),
        ...(body.elapsedMs !== undefined ? { elapsedMs: body.elapsedMs } : {}),
      });
    }

    return { stepId: step.id, value: outcome.value };
  });
}
