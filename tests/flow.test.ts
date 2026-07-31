import { describe, expect, it } from "vitest";
import {
  activeMissionId,
  campaignProgress,
  completedMissions,
  firstOpenStepIndex,
  formatElapsed,
  isLastMissionOfLevel,
  isMissionComplete,
  isReadyToLaunch,
  isStage,
  nextMissionId,
  visibleLineIds,
} from "@/lib/flow";
import { getCampaign } from "@/campaigns";
import { allSteps } from "@/campaigns/types";

/**
 * Flow progression is derived from persisted decisions rather than tracked
 * separately, so these guard the "resume exactly where you left off" promise.
 */

const campaign = getCampaign("support-desk")!;
const [m1, m2, m3] = campaign.missions;
/** Derived, not hardcoded — adding a mission must not break these tests. */
const lastMission = campaign.missions[campaign.missions.length - 1]!;
const secondToLast = campaign.missions[campaign.missions.length - 2]!;

/** Produces a valid answer for any step, whatever rule the campaign gives it. */
function answerFor(step: (typeof campaign.missions)[number]["steps"][number]): string | number {
  if (step.input.kind === "select") return step.input.options![0]!.value;
  if (step.input.kind === "number") {
    const rule = step.rule as { min?: number };
    return rule.min ?? 100;
  }
  // Prefer a starter: campaign minimum lengths vary, and a starter is
  // guaranteed valid by the campaign-data tests.
  if (step.input.starters?.length) return step.input.starters[0]!.value;
  return "A sufficiently long, specific and entirely valid answer for this particular decision.";
}

function answers(...missionIds: string[]): Record<string, string | number> {
  const decisions: Record<string, string | number> = {};

  for (const mission of campaign.missions) {
    if (!missionIds.includes(mission.id)) continue;
    for (const step of mission.steps) decisions[step.id] = answerFor(step);
  }

  return decisions;
}

describe("mission completion", () => {
  it("is false while any step is unanswered", () => {
    expect(isMissionComplete(campaign, m1!.id, {})).toBe(false);
  });

  it("is true once every step validates", () => {
    expect(isMissionComplete(campaign, m1!.id, answers(m1!.id))).toBe(true);
  });

  it("ignores unknown missions rather than throwing", () => {
    expect(isMissionComplete(campaign, "does-not-exist", {})).toBe(false);
  });

  it("lists completed missions in campaign order", () => {
    expect(completedMissions(campaign, answers(m2!.id, m1!.id))).toEqual([m1!.id, m2!.id]);
  });
});

describe("resume position", () => {
  it("starts a fresh build on the first mission's first step", () => {
    expect(activeMissionId(campaign, {})).toBe(m1!.id);
    expect(firstOpenStepIndex(campaign, m1!.id, {})).toBe(0);
  });

  it("resumes on the first mission that still has open steps", () => {
    expect(activeMissionId(campaign, answers(m1!.id, m2!.id))).toBe(m3!.id);
  });

  it("resumes mid-mission on the first unanswered step", () => {
    const decisions = answers(m1!.id);
    delete decisions[m1!.steps[1]!.id];

    expect(firstOpenStepIndex(campaign, m1!.id, decisions)).toBe(1);
  });

  it("reports -1 when a mission has nothing left open", () => {
    expect(firstOpenStepIndex(campaign, m1!.id, answers(m1!.id))).toBe(-1);
  });

  it("stays on the last mission once everything is answered", () => {
    const everything = answers(...campaign.missions.map((m) => m.id));
    expect(activeMissionId(campaign, everything)).toBe(lastMission.id);
  });
});

describe("level boundaries", () => {
  it("recognises the last mission of a level", () => {
    expect(isLastMissionOfLevel(campaign, m2!.id)).toBe(true);
    expect(isLastMissionOfLevel(campaign, m1!.id)).toBe(false);
  });

  it("walks missions in order and stops at the end", () => {
    expect(nextMissionId(campaign, m1!.id)).toBe(m2!.id);
    expect(nextMissionId(campaign, secondToLast.id)).toBe(lastMission.id);
    expect(nextMissionId(campaign, lastMission.id)).toBeUndefined();
  });
});

describe("launch readiness", () => {
  it("is false until every mission is complete", () => {
    expect(isReadyToLaunch(campaign, answers(m1!.id, m2!.id, m3!.id))).toBe(false);
  });

  it("is true when every mission is complete", () => {
    expect(isReadyToLaunch(campaign, answers(...campaign.missions.map((m) => m.id)))).toBe(true);
  });
});

describe("the artifact grows", () => {
  it("shows only the first mission's lines at the start", () => {
    const visible = visibleLineIds(campaign, m1!.id);
    const all = campaign.artifact.lines.map((l) => l.id);

    expect(visible.length).toBeGreaterThan(0);
    expect(visible.length).toBeLessThan(all.length);
  });

  it("reveals strictly more lines as missions progress", () => {
    const counts = campaign.missions.map((m) => visibleLineIds(campaign, m.id).length);

    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]!).toBeGreaterThanOrEqual(counts[i - 1]!);
    }
    expect(counts.at(-1)).toBe(campaign.artifact.lines.length);
  });

  it("never hides a line belonging to a mission already reached", () => {
    const visible = new Set(visibleLineIds(campaign, m3!.id));
    const earlier = campaign.artifact.lines.filter((l) =>
      [m1!.id, m2!.id, m3!.id].includes(l.fromMissionId),
    );

    for (const line of earlier) {
      expect(visible.has(line.id), `line ${line.id}`).toBe(true);
    }
  });
});

describe("campaignProgress", () => {
  it("runs from 0 to 1 across the whole campaign", () => {
    expect(campaignProgress(campaign, {})).toBe(0);
    expect(campaignProgress(campaign, answers(...campaign.missions.map((m) => m.id)))).toBe(1);
  });

  it("counts answered steps, not missions", () => {
    const total = allSteps(campaign).length;
    const progress = campaignProgress(campaign, answers(m1!.id));

    expect(progress).toBeCloseTo(m1!.steps.length / total, 5);
  });
});

describe("stage parsing", () => {
  it("accepts known stages and rejects anything else", () => {
    // Guards the URL and the database against arbitrary values.
    expect(isStage("mission")).toBe(true);
    expect(isStage("chat")).toBe(true);
    expect(isStage("nonsense")).toBe(false);
    expect(isStage(null)).toBe(false);
    expect(isStage(7)).toBe(false);
  });
});

describe("formatElapsed", () => {
  it("pads minutes and seconds", () => {
    expect(formatElapsed(0)).toBe("00:00");
    expect(formatElapsed(65_000)).toBe("01:05");
  });

  it("adds an hours field only once it's needed", () => {
    expect(formatElapsed(3_600_000)).toBe("1:00:00");
    expect(formatElapsed(3_723_000)).toBe("1:02:03");
  });

  it("clamps negatives rather than rendering nonsense", () => {
    expect(formatElapsed(-5000)).toBe("00:00");
  });
});
