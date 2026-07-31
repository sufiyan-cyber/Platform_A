import "server-only";
import { db } from "@/server/db";
import { AppError } from "@/lib/api-error";
import { getCampaign } from "@/campaigns";
import type { Campaign } from "@/campaigns/types";
import type { DecisionMap, LyzrAgentPayload } from "@/lib/assemble";
import { isStage, type Stage } from "@/lib/flow";
import { toShareState, type ShareState } from "@/server/share";
import type { SearchSource } from "@/server/search";
import type { GroundingStatus } from "@/server/grounding";

/**
 * Build persistence.
 *
 * The wire format the client sees. Everything the guided flow needs to render
 * itself from cold — after a refresh, on another device, a week later — is in
 * here, which is what makes "nothing is in-memory-only" true rather than
 * aspirational.
 */
export type BuildState = {
  id: string;
  campaignId: string;
  status: "in_progress" | "launched";
  xp: number;
  elapsedMs: number;
  stage: Stage;
  currentMissionId: string | null;
  completedMissionIds: string[];
  decisions: DecisionMap;
  agent: { id: string; name: string; launchedAt: string } | null;
  launchPayload: LyzrAgentPayload | null;
  /** Owner's view of the public link. See src/server/share.ts. */
  share: ShareState;
};

export type ChatChannel = "agent" | "mentor";

export type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  /**
   * Citations behind a grounded reply. Persisted with the message rather than
   * held in component state, so they survive a refresh exactly like the reply
   * they belong to — a citation list that vanishes on reload would make the
   * sources look decorative.
   */
  sources?: SearchSource[];
  /** Why a grounded campaign's reply has no sources. Absent on ordinary replies. */
  grounding?: GroundingStatus;
};

/* ── Reading ───────────────────────────────────────────────────────────────── */

type BuildRow = {
  id: string;
  campaignId: string;
  status: string;
  xp: number;
  elapsedMs: number;
  stage: string;
  currentMissionId: string | null;
  completedMissionIds: string;
  agentId: string | null;
  agentName: string | null;
  launchedAt: Date | null;
  launchPayload: string | null;
  shareToken: string | null;
  sharedAt: Date | null;
  shareChatEnabled: boolean;
  shareChatCount: number;
  decisions: { stepId: string; value: string }[];
};

function toBuildState(row: BuildRow): BuildState {
  const decisions: DecisionMap = {};
  for (const decision of row.decisions) {
    const parsed = safeJson(decision.value);
    if (typeof parsed === "string" || typeof parsed === "number") {
      decisions[decision.stepId] = parsed;
    }
  }

  return {
    id: row.id,
    campaignId: row.campaignId,
    status: row.status === "launched" ? "launched" : "in_progress",
    xp: row.xp,
    elapsedMs: row.elapsedMs,
    stage: isStage(row.stage) ? row.stage : "orientation",
    currentMissionId: row.currentMissionId,
    completedMissionIds: parseIdList(row.completedMissionIds),
    decisions,
    agent:
      row.agentId && row.agentName && row.launchedAt
        ? { id: row.agentId, name: row.agentName, launchedAt: row.launchedAt.toISOString() }
        : null,
    launchPayload: (safeJson(row.launchPayload) as LyzrAgentPayload | null) ?? null,
    share: toShareState(row),
  };
}

/**
 * Anything persisted as JSON is parsed defensively. A corrupt row degrades to a
 * missing value the developer can re-enter — never to a 500 on page load.
 */
function safeJson(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseIdList(value: string): string[] {
  const parsed = safeJson(value);
  return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
}

const DECISION_SELECT = {
  id: true,
  campaignId: true,
  status: true,
  xp: true,
  elapsedMs: true,
  stage: true,
  currentMissionId: true,
  completedMissionIds: true,
  agentId: true,
  agentName: true,
  launchedAt: true,
  launchPayload: true,
  shareToken: true,
  sharedAt: true,
  shareChatEnabled: true,
  shareChatCount: true,
  decisions: { select: { stepId: true, value: true } },
} as const;

/**
 * Gets the developer's build for a campaign, creating it on first visit.
 * Idempotent by design — the flow calls it on every entry to the build route.
 */
export async function getOrCreateBuild(userId: string, campaignId: string): Promise<BuildState> {
  const campaign = getCampaign(campaignId);
  if (!campaign) throw new AppError("not_found", "That campaign doesn't exist.");
  if (campaign.locked) {
    throw new AppError("conflict", campaign.locked.reason, { retryable: false });
  }

  const existing = await db.build.findUnique({
    where: { userId_campaignId: { userId, campaignId } },
    select: DECISION_SELECT,
  });
  if (existing) return toBuildState(existing);

  const created = await db.build.create({
    data: {
      userId,
      campaignId,
      stage: "orientation",
      currentMissionId: campaign.missions[0]?.id ?? null,
    },
    select: DECISION_SELECT,
  });

  return toBuildState(created);
}

/** Compact per-campaign progress for the select screen. */
export type BuildSummary = {
  campaignId: string;
  status: "in_progress" | "launched";
  xp: number;
  completedMissionIds: string[];
  answeredStepIds: string[];
  /** Launched builds only — drives the "your agents" list on the select screen. */
  agentName: string | null;
  launchedAt: string | null;
  shareToken: string | null;
};

export async function listBuildSummaries(userId: string): Promise<BuildSummary[]> {
  const rows = await db.build.findMany({
    where: { userId },
    select: {
      campaignId: true,
      status: true,
      xp: true,
      completedMissionIds: true,
      agentName: true,
      launchedAt: true,
      shareToken: true,
      decisions: { select: { stepId: true } },
    },
    orderBy: { launchedAt: "desc" },
  });

  return rows.map((row) => ({
    campaignId: row.campaignId,
    status: row.status === "launched" ? "launched" : "in_progress",
    xp: row.xp,
    completedMissionIds: parseIdList(row.completedMissionIds),
    answeredStepIds: row.decisions.map((d) => d.stepId),
    agentName: row.agentName,
    launchedAt: row.launchedAt?.toISOString() ?? null,
    shareToken: row.shareToken,
  }));
}

/** Loads a build the caller must own. Ownership failure reads as "not found". */
export async function loadOwnedBuild(userId: string, buildId: string): Promise<BuildState> {
  const row = await db.build.findFirst({
    where: { id: buildId, userId },
    select: DECISION_SELECT,
  });
  if (!row) throw new AppError("not_found", "We couldn't find that build.");
  return toBuildState(row);
}

/** Loads the campaign definition for a build, or 404s. */
export function campaignForBuild(build: BuildState): Campaign {
  const campaign = getCampaign(build.campaignId);
  if (!campaign) {
    throw new AppError(
      "not_found",
      "The campaign this build belongs to is no longer available.",
      { retryable: false },
    );
  }
  return campaign;
}

/* ── Writing ───────────────────────────────────────────────────────────────── */

/**
 * Saves one validated decision. Upsert, so re-answering a step overwrites
 * cleanly and a double-submit is harmless.
 */
export async function saveDecision(params: {
  buildId: string;
  stepId: string;
  value: string | number;
}): Promise<void> {
  const serialized = JSON.stringify(params.value);
  await db.decision.upsert({
    where: { buildId_stepId: { buildId: params.buildId, stepId: params.stepId } },
    update: { value: serialized },
    create: { buildId: params.buildId, stepId: params.stepId, value: serialized },
  });
}

/** Position + timer. Called often and cheap; never blocks the UI. */
export async function saveProgress(params: {
  buildId: string;
  stage?: Stage;
  currentMissionId?: string | null;
  elapsedMs?: number;
}): Promise<void> {
  await db.build.update({
    where: { id: params.buildId },
    data: {
      ...(params.stage !== undefined ? { stage: params.stage } : {}),
      ...(params.currentMissionId !== undefined ? { currentMissionId: params.currentMissionId } : {}),
      ...(params.elapsedMs !== undefined ? { elapsedMs: params.elapsedMs } : {}),
    },
  });
}

/**
 * Banks a mission's XP exactly once.
 *
 * The completed-mission list is the ledger: if the id is already in it, this is
 * a replay (a double-click, a retried request, a refresh mid-animation) and no
 * XP is awarded. Returns the resulting totals so the client doesn't have to
 * guess whether its optimistic update was right.
 */
export async function completeMission(params: {
  buildId: string;
  missionId: string;
  xp: number;
}): Promise<{ xp: number; completedMissionIds: string[]; awarded: number }> {
  const build = await db.build.findUnique({
    where: { id: params.buildId },
    select: { xp: true, completedMissionIds: true },
  });
  if (!build) throw new AppError("not_found", "We couldn't find that build.");

  const completed = parseIdList(build.completedMissionIds);
  if (completed.includes(params.missionId)) {
    return { xp: build.xp, completedMissionIds: completed, awarded: 0 };
  }

  const next = [...completed, params.missionId];
  const updated = await db.build.update({
    where: { id: params.buildId },
    data: { xp: build.xp + params.xp, completedMissionIds: JSON.stringify(next) },
    select: { xp: true },
  });

  return { xp: updated.xp, completedMissionIds: next, awarded: params.xp };
}

/** Records a successful launch. */
export async function recordLaunch(params: {
  buildId: string;
  agentId: string;
  agentName: string;
  payload: LyzrAgentPayload;
  chatSessionId: string;
}): Promise<void> {
  await db.build.update({
    where: { id: params.buildId },
    data: {
      status: "launched",
      stage: "chat",
      agentId: params.agentId,
      agentName: params.agentName,
      chatSessionId: params.chatSessionId,
      launchedAt: new Date(),
      launchPayload: JSON.stringify(params.payload),
    },
  });
}

export async function renameAgent(buildId: string, name: string): Promise<void> {
  await db.build.update({ where: { id: buildId }, data: { agentName: name } });
}

/** The chat session id, created lazily so pre-launch builds don't carry one. */
export async function getChatSessionId(buildId: string): Promise<string> {
  const build = await db.build.findUnique({
    where: { id: buildId },
    select: { chatSessionId: true },
  });
  if (build?.chatSessionId) return build.chatSessionId;

  const sessionId = `build-${buildId}-${Date.now()}`;
  await db.build.update({ where: { id: buildId }, data: { chatSessionId: sessionId } });
  return sessionId;
}

/* ── Transcripts ───────────────────────────────────────────────────────────── */

/** The non-text half of a message, serialised into `ChatMessage.meta`. */
export type MessageMeta = {
  sources?: SearchSource[];
  grounding?: GroundingStatus;
};

export async function appendMessage(params: {
  buildId: string;
  channel: ChatChannel;
  role: "user" | "assistant";
  content: string;
  meta?: MessageMeta;
}): Promise<StoredMessage> {
  // An empty meta object is stored as null rather than "{}" — most messages have
  // no context, and a column full of empty objects makes the ones that matter
  // harder to spot when reading the table by hand.
  const meta = params.meta && Object.keys(params.meta).length > 0 ? params.meta : undefined;

  const row = await db.chatMessage.create({
    data: {
      buildId: params.buildId,
      channel: params.channel,
      role: params.role,
      content: params.content,
      meta: meta ? JSON.stringify(meta) : null,
    },
  });

  return {
    id: row.id,
    role: params.role,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    ...(meta ?? {}),
  };
}

export async function loadMessages(
  buildId: string,
  channel: ChatChannel,
  limit = 100,
): Promise<StoredMessage[]> {
  const rows = await db.chatMessage.findMany({
    where: { buildId, channel },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  return rows.map((row) => ({
    id: row.id,
    role: row.role === "user" ? "user" : "assistant",
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    ...parseMeta(row.meta),
  }));
}

/**
 * Reads `meta` back, discarding anything that isn't the shape we wrote.
 *
 * Citations get the strictest parsing in the codebase, because a malformed one
 * is not a cosmetic bug: a source rendered without a valid URL is a claim the
 * reader cannot check, which is the exact thing this feature exists to avoid.
 * Anything questionable is dropped rather than displayed.
 */
function parseMeta(value: string | null): MessageMeta {
  const parsed = safeJson(value);
  if (!parsed || typeof parsed !== "object") return {};

  const record = parsed as Record<string, unknown>;
  const meta: MessageMeta = {};

  if (Array.isArray(record.sources)) {
    const sources = record.sources
      .filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === "object")
      .filter((s) => typeof s.url === "string" && typeof s.title === "string")
      .map((s) => ({
        title: String(s.title),
        url: String(s.url),
        snippet: typeof s.snippet === "string" ? s.snippet : "",
        publishedDate: typeof s.publishedDate === "string" ? s.publishedDate : null,
      }));
    if (sources.length > 0) meta.sources = sources;
  }

  if (typeof record.grounding === "string") {
    meta.grounding = record.grounding as GroundingStatus;
  }

  return meta;
}
