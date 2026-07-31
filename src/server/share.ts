import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "@/server/db";
import { AppError } from "@/lib/api-error";
import { getCampaign } from "@/campaigns";
import { findMissionForStep, findStep, totalXp, type IconKey } from "@/campaigns/types";
import type { LyzrAgentPayload } from "@/lib/assemble";

/**
 * Public share links.
 *
 * A launched build can be published at `/a/<token>`, which shows the config the
 * developer wrote and — at their option — lets a visitor talk to the agent.
 *
 * Three deliberate properties:
 *
 *   1. **The token IS the capability.** Revoking sets it back to null, so a
 *      revoked link is unresolvable rather than resolvable-but-flagged. There is
 *      no code path where forgetting to check a boolean leaks a private build.
 *   2. **Nothing identifying travels.** The public projection is built here, by
 *      hand, from named fields — it is not a filtered `BuildState`. Adding a
 *      column to Build can therefore never accidentally publish it, and the
 *      developer's email address has no route to this page at all.
 *   3. **Visitor chat is spend-capped twice**: per-IP by the rate limiter at the
 *      route, and per-link for its whole lifetime by `SHARE_CHAT_LIMIT` here.
 *      Someone passing a link around a Discord cannot drain an API key.
 */

/**
 * Total visitor messages one share link may ever spend.
 *
 * A share link is for showing someone what you built, not for hosting a support
 * desk — but 100 turned out to be tight for a live demo (15 people × a few
 * messages each sits right on the cap, and hitting it closes the composer
 * mid-session). 500 keeps the "a link passed around cannot drain your key"
 * guarantee while leaving room for a room. Revoke and re-share for a fresh
 * budget.
 */
export const SHARE_CHAT_LIMIT = 500;

/** Bytes of entropy in a token. 16 → 22 URL-safe chars, unguessable. */
const TOKEN_BYTES = 16;

function newToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/* ── Owner-side state, carried on BuildState ───────────────────────────────── */

export type ShareState = {
  token: string | null;
  sharedAt: string | null;
  chatEnabled: boolean;
  chatUsed: number;
  chatLimit: number;
};

export function toShareState(row: {
  shareToken: string | null;
  sharedAt: Date | null;
  shareChatEnabled: boolean;
  shareChatCount: number;
}): ShareState {
  return {
    token: row.shareToken,
    sharedAt: row.sharedAt?.toISOString() ?? null,
    chatEnabled: row.shareChatEnabled,
    chatUsed: row.shareChatCount,
    chatLimit: SHARE_CHAT_LIMIT,
  };
}

/* ── Owner operations ──────────────────────────────────────────────────────── */

async function requireLaunchedBuild(userId: string, buildId: string) {
  const build = await db.build.findFirst({
    where: { id: buildId, userId },
    select: { id: true, agentId: true, shareToken: true },
  });
  // Ownership failure reads as "not found" — a stranger learns nothing about
  // whether the id exists.
  if (!build) throw new AppError("not_found", "We couldn't find that build.");
  if (!build.agentId) {
    throw new AppError("conflict", "Launch your agent before sharing it.", { retryable: false });
  }
  return build;
}

/**
 * Creates the link, or returns the existing one.
 *
 * Idempotent on purpose: a double-click must not rotate the token out from under
 * a link the developer has already pasted somewhere.
 */
export async function createShareLink(userId: string, buildId: string): Promise<ShareState> {
  const build = await requireLaunchedBuild(userId, buildId);

  if (build.shareToken) {
    const existing = await db.build.findUnique({
      where: { id: buildId },
      select: SHARE_SELECT,
    });
    return toShareState(existing!);
  }

  // A 128-bit collision is not a thing that happens, but the unique constraint
  // is the authority and a retry is two lines.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const updated = await db.build.update({
        where: { id: buildId },
        data: { shareToken: newToken(), sharedAt: new Date() },
        select: SHARE_SELECT,
      });
      return toShareState(updated);
    } catch {
      if (attempt === 2) throw new AppError("internal", "Couldn't create a share link. Try again.");
    }
  }

  throw new AppError("internal");
}

/** Revoking nulls the token, so the old URL stops resolving immediately. */
export async function revokeShareLink(userId: string, buildId: string): Promise<ShareState> {
  await requireLaunchedBuild(userId, buildId);
  const updated = await db.build.update({
    where: { id: buildId },
    // The counter resets with the link: a new link is a new budget, and the
    // number shown next to it always describes the link you currently have.
    data: { shareToken: null, sharedAt: null, shareChatCount: 0 },
    select: SHARE_SELECT,
  });
  return toShareState(updated);
}

export async function setShareChat(
  userId: string,
  buildId: string,
  enabled: boolean,
): Promise<ShareState> {
  await requireLaunchedBuild(userId, buildId);
  const updated = await db.build.update({
    where: { id: buildId },
    data: { shareChatEnabled: enabled },
    select: SHARE_SELECT,
  });
  return toShareState(updated);
}

const SHARE_SELECT = {
  shareToken: true,
  sharedAt: true,
  shareChatEnabled: true,
  shareChatCount: true,
} as const;

/* ── The public projection ─────────────────────────────────────────────────── */

/**
 * Everything the public page renders — and nothing else.
 *
 * Note what is absent: email, user id, build id, agent id, chat session id, the
 * developer's other campaigns. The visitor cannot address anything but the
 * token they were given.
 */
export type SharedAgentView = {
  agentName: string;
  launchedAt: string;
  builderHandle: string;
  xp: number;
  xpTotal: number;
  campaign: {
    name: string;
    tagline: string;
    outcome: string;
    iconKey: IconKey;
    /** This agent searches the web before answering. Drives the visitor-side citations. */
    grounded: boolean;
  };
  config: {
    model: string;
    provider: string;
    role: string;
    goal: string;
    instructions: string;
    temperature: number;
    topP: number;
    memory: boolean;
  };
  decisions: { stepId: string; label: string; mission: string; value: string }[];
  chat: { enabled: boolean; remaining: number };
};

/** Resolves a token to the public view, or 404s. */
export async function loadSharedBuild(token: string): Promise<SharedAgentView> {
  const row = await db.build.findUnique({
    where: { shareToken: token },
    select: {
      campaignId: true,
      xp: true,
      agentName: true,
      launchedAt: true,
      launchPayload: true,
      shareChatEnabled: true,
      shareChatCount: true,
      user: { select: { handle: true } },
      decisions: { select: { stepId: true, value: true } },
    },
  });

  if (!row || !row.agentName || !row.launchedAt) {
    throw new AppError("not_found", "This share link isn't valid any more.", { retryable: false });
  }

  const campaign = getCampaign(row.campaignId);
  if (!campaign) {
    throw new AppError("not_found", "This share link isn't valid any more.", { retryable: false });
  }

  const payload = safePayload(row.launchPayload);
  if (!payload) {
    throw new AppError("not_found", "This share link isn't valid any more.", { retryable: false });
  }

  const decisions = row.decisions
    .map((decision) => {
      const step = findStep(campaign, decision.stepId);
      if (!step) return null;
      const value = safeValue(decision.value);
      if (value === null) return null;
      return {
        stepId: decision.stepId,
        label: step.label,
        mission: findMissionForStep(campaign, decision.stepId)?.title ?? "",
        value,
      };
    })
    .filter((d): d is NonNullable<typeof d> => d !== null);

  // Keep campaign order rather than insertion order, so the receipt reads in the
  // order the decisions were actually asked.
  const order = campaign.missions.flatMap((m) => m.steps.map((s) => s.id));
  decisions.sort((a, b) => order.indexOf(a.stepId) - order.indexOf(b.stepId));

  return {
    agentName: row.agentName,
    launchedAt: row.launchedAt.toISOString(),
    builderHandle: row.user.handle,
    xp: row.xp,
    xpTotal: totalXp(campaign),
    campaign: {
      name: campaign.name,
      tagline: campaign.tagline,
      outcome: campaign.outcome,
      iconKey: campaign.iconKey,
      grounded: campaign.retrieval?.kind === "web",
    },
    config: {
      model: payload.model,
      provider: payload.provider_id,
      role: payload.agent_role,
      goal: payload.agent_goal,
      instructions: payload.agent_instructions,
      temperature: payload.temperature,
      topP: payload.top_p,
      memory: payload.features.some((f) => f.type === "SHORT_TERM_MEMORY"),
    },
    decisions,
    chat: {
      enabled: row.shareChatEnabled,
      remaining: Math.max(0, SHARE_CHAT_LIMIT - row.shareChatCount),
    },
  };
}

/* ── Visitor chat ──────────────────────────────────────────────────────────── */

export type ShareChatTarget = {
  buildId: string;
  agentId: string;
  /** Owner's id — Lyzr attributes the conversation to whoever owns the agent. */
  ownerId: string;
  /** So the visitor route can read the campaign's `retrieval` config. */
  campaignId: string;
  remaining: number;
};

/**
 * Resolves a token to something chattable, enforcing the owner's switch and the
 * lifetime cap. Called on every visitor turn — the checks live here rather than
 * in the route so a second entry point can't skip them.
 */
export async function loadShareChatTarget(token: string): Promise<ShareChatTarget> {
  const row = await db.build.findUnique({
    where: { shareToken: token },
    select: {
      id: true,
      userId: true,
      agentId: true,
      campaignId: true,
      shareChatEnabled: true,
      shareChatCount: true,
    },
  });

  if (!row || !row.agentId) {
    throw new AppError("not_found", "This share link isn't valid any more.", { retryable: false });
  }

  if (!row.shareChatEnabled) {
    throw new AppError("conflict", "The owner of this agent has turned off replies.", {
      retryable: false,
    });
  }

  const remaining = SHARE_CHAT_LIMIT - row.shareChatCount;
  if (remaining <= 0) {
    throw new AppError(
      "conflict",
      "This shared agent has used up its demo messages. Ask whoever shared it for a fresh link.",
      { retryable: false },
    );
  }

  return {
    buildId: row.id,
    agentId: row.agentId,
    ownerId: row.userId,
    campaignId: row.campaignId,
    remaining,
  };
}

/**
 * Resolves a token for a *handoff* rather than a chat turn.
 *
 * Deliberately weaker preconditions than `loadShareChatTarget`: it doesn't check
 * the reply toggle and doesn't touch the message budget. A visitor who read the
 * config and wants a human should be able to say so even on a link whose owner
 * turned replies off, and asking for a person costs no upstream call, so
 * charging it against the chat budget would be charging for the wrong thing.
 */
export async function loadShareEscalationTarget(token: string): Promise<{ buildId: string }> {
  const row = await db.build.findUnique({
    where: { shareToken: token },
    select: { id: true, agentId: true },
  });

  if (!row || !row.agentId) {
    throw new AppError("not_found", "This share link isn't valid any more.", { retryable: false });
  }

  return { buildId: row.id };
}

/**
 * Books one visitor message against the link's budget.
 *
 * Called *before* the upstream request, and incremented atomically by the
 * database rather than read-modify-written here — two visitors arriving in the
 * same millisecond must not both be handed the last message.
 */
export async function bookShareChatTurn(buildId: string): Promise<void> {
  await db.build.update({
    where: { id: buildId },
    data: { shareChatCount: { increment: 1 } },
  });
}

/** Hands a message back when the upstream call failed, so a 503 costs nothing. */
export async function refundShareChatTurn(buildId: string): Promise<void> {
  await db.build.update({
    where: { id: buildId },
    data: { shareChatCount: { decrement: 1 } },
  });
}

/* ── Helpers ───────────────────────────────────────────────────────────────── */

function safePayload(value: string | null): LyzrAgentPayload | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as LyzrAgentPayload;
    // The receipt is the whole point of the page — if the stored payload isn't
    // the shape we expect, 404 beats rendering a page full of "undefined".
    if (
      typeof parsed?.model === "string" &&
      typeof parsed?.agent_role === "string" &&
      typeof parsed?.agent_instructions === "string" &&
      Array.isArray(parsed?.features)
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function safeValue(value: string): string | null {
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed === "string") return parsed;
    if (typeof parsed === "number") return String(parsed);
    return null;
  } catch {
    return null;
  }
}
