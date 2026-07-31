import type { Campaign } from "@/campaigns/types";
import { missionById, missionIndex, levelForMission } from "@/campaigns/types";
import type { DecisionMap } from "@/lib/assemble";
import { validateStep } from "@/lib/validation";

/**
 * The guided flow's screen machine.
 *
 * Stages are persisted (`Build.stage`) and mirrored into the URL, so a refresh,
 * a re-login, or a shared link all land on the same screen. Progression is
 * derived from persisted decisions rather than tracked separately — there is no
 * second source of truth to fall out of sync.
 */
export const STAGES = [
  "orientation",
  "level-intro",
  "mission-preview",
  "mission",
  "mission-complete",
  "level-complete",
  "launch",
  "chat",
] as const;

export type Stage = (typeof STAGES)[number];

export function isStage(value: unknown): value is Stage {
  return typeof value === "string" && (STAGES as readonly string[]).includes(value);
}

/** Human labels — used by the Mentor for context and by breadcrumbs. */
export const STAGE_LABEL: Record<Stage, string> = {
  orientation: "Orientation",
  "level-intro": "Level intro",
  "mission-preview": "Mission preview",
  mission: "In mission",
  "mission-complete": "Mission complete",
  "level-complete": "Level complete",
  launch: "Launch",
  chat: "Live agent chat",
};

/** Is every step of this mission answered and valid? */
export function isMissionComplete(
  campaign: Campaign,
  missionId: string,
  decisions: DecisionMap,
): boolean {
  const mission = missionById(campaign, missionId);
  if (!mission) return false;
  return mission.steps.every((s) => validateStep(s, decisions[s.id]).valid);
}

/** Index of the first unanswered step in a mission, or -1 when it's done. */
export function firstOpenStepIndex(
  campaign: Campaign,
  missionId: string,
  decisions: DecisionMap,
): number {
  const mission = missionById(campaign, missionId);
  if (!mission) return -1;
  return mission.steps.findIndex((s) => !validateStep(s, decisions[s.id]).valid);
}

/** Every mission whose steps are all valid. Source of truth for XP eligibility. */
export function completedMissions(campaign: Campaign, decisions: DecisionMap): string[] {
  return campaign.missions.filter((m) => isMissionComplete(campaign, m.id, decisions)).map((m) => m.id);
}

/** The mission the developer should be working on right now. */
export function activeMissionId(campaign: Campaign, decisions: DecisionMap): string {
  const next = campaign.missions.find((m) => !isMissionComplete(campaign, m.id, decisions));
  return next?.id ?? campaign.missions[campaign.missions.length - 1]!.id;
}

/** Is this the last mission of its level? Drives level-complete vs mission-complete. */
export function isLastMissionOfLevel(campaign: Campaign, missionId: string): boolean {
  const level = levelForMission(campaign, missionId);
  if (!level) return false;
  return level.missionIds[level.missionIds.length - 1] === missionId;
}

export function nextMissionId(campaign: Campaign, missionId: string): string | undefined {
  const index = missionIndex(campaign, missionId);
  return campaign.missions[index + 1]?.id;
}

/** All decisions across the campaign valid ⇒ the agent can be built. */
export function isReadyToLaunch(campaign: Campaign, decisions: DecisionMap): boolean {
  return campaign.missions.every((m) => isMissionComplete(campaign, m.id, decisions));
}

/**
 * Artifact lines visible right now. Lines belong to a mission and appear once
 * that mission has been *reached* — this is what makes the config visibly grow
 * instead of sitting there fully-formed from the start.
 */
export function visibleLineIds(campaign: Campaign, currentMissionId: string): string[] {
  const currentIndex = missionIndex(campaign, currentMissionId);
  return campaign.artifact.lines
    .filter((line) => missionIndex(campaign, line.fromMissionId) <= currentIndex)
    .map((line) => line.id);
}

/** 0–1 completion across the whole campaign, for the progress rail. */
export function campaignProgress(campaign: Campaign, decisions: DecisionMap): number {
  const steps = campaign.missions.flatMap((m) => m.steps);
  if (steps.length === 0) return 0;
  const done = steps.filter((s) => validateStep(s, decisions[s.id]).valid).length;
  return done / steps.length;
}

export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}
