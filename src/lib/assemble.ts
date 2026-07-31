import type { Campaign, Step } from "@/campaigns/types";
import { allSteps, findStep } from "@/campaigns/types";
import { validateStep, type StepValue } from "@/lib/validation";
import { AppError } from "@/lib/api-error";

/**
 * The payload we POST to Lyzr `/v3/agents/`.
 *
 * This is the *wire* shape, field-for-field, not a friendlier intermediate —
 * which is what lets the launch screen honestly label its preview "exactly what
 * gets sent". Verified against the live OpenAPI spec; the quickstart page
 * documents a different endpoint and different field names, and neither works.
 *
 * `temperature` and `top_p` are required by the schema, so they come from
 * campaign-level defaults in `assembly` rather than being omitted.
 */
export type LyzrFeature = {
  type: string;
  config: Record<string, unknown>;
  priority: number;
};

export type LyzrAgentPayload = {
  name: string;
  provider_id: string;
  model: string;
  agent_role: string;
  agent_goal: string;
  agent_instructions: string;
  temperature: number;
  top_p: number;
  features: LyzrFeature[];
  tools: unknown[];
};

/**
 * Conversational memory.
 *
 * Without this, every turn is evaluated in isolation: the agent asks for an
 * account email, is given it, thanks the customer — and asks for it again on the
 * next message. `features: []` is the schema default, which makes a chat agent
 * that cannot hold a conversation the *silent* default. Every agent this
 * platform builds is conversational, so it is always on.
 *
 * The type string is case-sensitive and validated at inference time, not at
 * create time: `short_term_memory` is accepted by `POST /v3/agents/`, stored on
 * the record, and then silently does nothing. Verified by two-turn recall test —
 * `SHORT_TERM_MEMORY` remembers, the lowercase form does not.
 */
export const SHORT_TERM_MEMORY: LyzrFeature = {
  type: "SHORT_TERM_MEMORY",
  config: {},
  priority: 0,
};

/**
 * The standing honesty rule, appended to every agent this platform builds.
 *
 * Why this is not left to the developer's own instructions: an agent told to
 * "escalate to a human" has no tools, so producing the sentence *is* the entire
 * action. It will announce that it has escalated, forwarded, or filed something,
 * and the customer waits for a reply nobody knows to send. That was observed on
 * a real build here, and it is the single most likely way an agent produced by
 * this platform embarrasses the person who shipped it.
 *
 * Documenting the fix in a campaign starter wasn't enough — that only protects
 * developers who remember to paste the right block. Putting it here makes the
 * failure unreachable.
 *
 * Deliberately scoped to *acting on the world*, not to knowing things. Retrieval
 * (web search, a knowledge base) changes what an agent can look up; it never
 * gives it the ability to send mail or change a record. So this text stays true
 * as capabilities are added, and campaigns that gain retrieval describe their
 * sources separately rather than editing this.
 */
export const NO_ACTIONS_CLAUSE = `## Actions you cannot take
You cannot send email, open or update a ticket, notify a person, charge or refund anything, or change any record. You have no ability to act on the world, now or at any later point.
Never claim you have escalated, forwarded, flagged, filed, notified, processed, or updated anything — and never promise that you will. Both are false. There is no later step in which you do it.
When something needs an action you cannot perform, say so in your first sentence, before any sympathy or explanation. Then tell them exactly who to contact and what to include.`;

export type DecisionMap = Record<string, StepValue>;

/**
 * Turns the developer's collected decisions into a real agent config.
 *
 * Every step is re-validated here even though the client validated it and the
 * API validated it on save. This is the last gate before we spend a real API
 * call, and it is the one that must not be skippable.
 */
export function assembleAgentPayload(campaign: Campaign, decisions: DecisionMap): LyzrAgentPayload {
  const missing: Record<string, string> = {};

  for (const step of allSteps(campaign)) {
    const outcome = validateStep(step, decisions[step.id]);
    if (!outcome.valid) missing[step.id] = outcome.message;
  }

  if (Object.keys(missing).length > 0) {
    throw new AppError(
      "invalid_input",
      "Some decisions are still missing or invalid — the agent can't be built yet.",
      { fields: missing, retryable: false },
    );
  }

  const { assembly } = campaign;
  const text = (stepId: string) => String(decisions[stepId]).trim();

  return {
    name: text(assembly.nameStepId),
    provider_id: assembly.providerId,
    model: text(assembly.modelStepId),
    agent_role: text(assembly.roleStepId),
    agent_goal: text(assembly.goalStepId),
    agent_instructions: composeInstructions(campaign, decisions),
    temperature: assembly.temperature,
    top_p: assembly.topP,
    features: [SHORT_TERM_MEMORY],
    tools: [],
  };
}

/**
 * Composes the `instructions` field from several decisions, each under its own
 * heading. Headings matter twice over: they give the model clean structure, and
 * they let the developer recognise their own words in the finished agent.
 */
export function composeInstructions(campaign: Campaign, decisions: DecisionMap): string {
  const sections = campaign.assembly.instructions
    .map(({ stepId, heading }) => {
      const raw = decisions[stepId];
      if (raw === undefined || String(raw).trim() === "") return null;
      return `## ${heading}\n${String(raw).trim()}`;
    })
    .filter((s): s is string => s !== null);

  // Appended last, and unconditionally. Last so the developer's own words come
  // first and stay recognisable in the launch preview; unconditional so no
  // campaign can opt out of it. See NO_ACTIONS_CLAUSE.
  return [campaign.assembly.instructionsPreamble.trim(), ...sections, NO_ACTIONS_CLAUSE]
    .join("\n\n")
    .trim();
}

/**
 * A human-readable preview of the payload, shown on the launch screen before we
 * call Lyzr. No surprises: what they see here is byte-for-byte what gets sent.
 */
export function previewPayload(payload: LyzrAgentPayload): string {
  return JSON.stringify(payload, null, 2);
}

/** Steps that still block launch, in flow order. Drives the "what's left" list. */
export function outstandingSteps(campaign: Campaign, decisions: DecisionMap): Step[] {
  return allSteps(campaign).filter((step) => !validateStep(step, decisions[step.id]).valid);
}

/** Reads one decision back with its step, for rendering committed slot values. */
export function decisionLabel(
  campaign: Campaign,
  stepId: string,
  decisions: DecisionMap,
): string | undefined {
  const raw = decisions[stepId];
  if (raw === undefined) return undefined;

  const step = findStep(campaign, stepId);
  if (step?.input.kind === "select") {
    const match = step.input.options?.find((o) => o.value === String(raw));
    if (match) return match.label;
  }
  return String(raw);
}
