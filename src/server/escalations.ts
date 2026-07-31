import "server-only";
import { db } from "@/server/db";
import { AppError } from "@/lib/api-error";

/**
 * Handoffs to a human.
 *
 * This module exists because of a specific observed failure: an agent with no
 * tools, told to "escalate to a human", produces the *sentence* "I've escalated
 * this" and nothing else happens. `NO_ACTIONS_CLAUSE` in src/lib/assemble.ts
 * closes that by forbidding the claim. This closes the other half — it makes the
 * claim true when someone actually wants it, by putting the handoff behind a
 * control the person clicks rather than behind a token the model predicts.
 *
 * The design consequence worth naming: nothing here is reachable by the agent.
 * There is no tool, no function call, no phrase that triggers it. A handoff
 * happens because a human pressed a button, which is the only way "this was
 * escalated" can be a fact rather than a hope.
 */

export type EscalationTurn = { role: "user" | "assistant"; content: string };

export type EscalationRecord = {
  id: string;
  reason: string | null;
  transcript: EscalationTurn[];
  source: "owner" | "visitor";
  status: string;
  createdAt: string;
};

/**
 * How much conversation travels with a handoff.
 *
 * Enough for whoever picks it up to see what went wrong, not so much that the
 * record becomes the whole transcript. Six turns is about three exchanges.
 */
export const TRANSCRIPT_TURNS = 6;

/** Per-turn ceiling, applied to client-supplied transcripts. */
const MAX_TURN_CHARS = 2_000;

/**
 * Lifetime cap per build.
 *
 * The visitor route can be called by anyone holding a share link, so the table
 * needs a bound that doesn't depend on the rate limiter's in-process memory
 * surviving a restart. Same reasoning as `SHARE_CHAT_LIMIT` in share.ts.
 */
export const ESCALATION_LIMIT = 200;

export async function createEscalation(params: {
  buildId: string;
  reason?: string | null;
  transcript: EscalationTurn[];
  source: "owner" | "visitor";
}): Promise<EscalationRecord> {
  const existing = await db.escalation.count({ where: { buildId: params.buildId } });
  if (existing >= ESCALATION_LIMIT) {
    throw new AppError(
      "conflict",
      "This agent has reached its handoff limit for the demo. Nothing was lost.",
      { retryable: false },
    );
  }

  const reason = params.reason?.trim() || null;
  const transcript = normalizeTranscript(params.transcript);

  const row = await db.escalation.create({
    data: {
      buildId: params.buildId,
      reason,
      transcript: JSON.stringify(transcript),
      source: params.source,
      status: "open",
    },
  });

  return {
    id: row.id,
    reason,
    transcript,
    source: params.source,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listEscalations(buildId: string, limit = 20): Promise<EscalationRecord[]> {
  const rows = await db.escalation.findMany({
    where: { buildId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return rows.map((row) => ({
    id: row.id,
    reason: row.reason,
    transcript: parseTranscript(row.transcript),
    source: row.source === "visitor" ? "visitor" : "owner",
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  }));
}

/**
 * Trims and bounds a transcript before it is stored.
 *
 * Applied to every source, not just the untrusted one. The owner's transcript
 * comes from our own database and the visitor's comes from their browser, but
 * routing both through the same normalisation means the stored shape is a
 * property of this function rather than of which caller happened to invoke it.
 */
function normalizeTranscript(turns: EscalationTurn[]): EscalationTurn[] {
  return turns
    .slice(-TRANSCRIPT_TURNS)
    .filter((turn) => typeof turn?.content === "string" && turn.content.trim().length > 0)
    .map((turn) => ({
      role: turn.role === "user" ? "user" : "assistant",
      content: turn.content.trim().slice(0, MAX_TURN_CHARS),
    }));
}

/** A corrupt transcript renders as an empty one — never as a 500 on the panel. */
function parseTranscript(value: string): EscalationTurn[] {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return normalizeTranscript(parsed as EscalationTurn[]);
  } catch {
    return [];
  }
}
