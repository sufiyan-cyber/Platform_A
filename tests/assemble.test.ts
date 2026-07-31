import { describe, expect, it } from "vitest";
import {
  assembleAgentPayload,
  composeInstructions,
  decisionLabel,
  NO_ACTIONS_CLAUSE,
  outstandingSteps,
} from "@/lib/assemble";
import { AppError } from "@/lib/api-error";
import { CAMPAIGNS, getCampaign } from "@/campaigns";
import { allSteps, type Campaign } from "@/campaigns/types";

/**
 * Assembly is the last gate before we spend a real API call and create a real
 * agent. Everything here is about it refusing to produce a half-built config.
 */

/** Fills every step of a campaign with its first valid-looking answer. */
function completeDecisions(campaign: Campaign): Record<string, string | number> {
  const decisions: Record<string, string | number> = {};

  for (const step of allSteps(campaign)) {
    if (step.input.kind === "select") {
      decisions[step.id] = step.input.options![0]!.value;
    } else if (step.input.kind === "number") {
      const rule = step.rule as { min?: number; max?: number };
      decisions[step.id] = rule.min ?? 100;
    } else if (step.input.starters?.length) {
      decisions[step.id] = step.input.starters[0]!.value;
    } else {
      decisions[step.id] = "A sufficiently long and specific answer for this decision.";
    }
  }

  return decisions;
}

const support = getCampaign("support-desk")!;

describe("assembleAgentPayload", () => {
  it("produces exactly the wire shape Lyzr's schema requires", () => {
    const payload = assembleAgentPayload(support, completeDecisions(support));

    // Asserted exactly, not loosely. This shape was wrong once already — built
    // from the quickstart page, which documents `role`/`goal`/`instructions`/
    // `provider` against `POST /v3/agent`. None of those exist; the real
    // endpoint is `POST /v3/agents/` and every field name differs.
    expect(Object.keys(payload).sort()).toEqual([
      "agent_goal",
      "agent_instructions",
      "agent_role",
      "features",
      "model",
      "name",
      "provider_id",
      "temperature",
      "tools",
      "top_p",
    ]);
  });

  it("splits vendor from model — Lyzr treats them as separate fields", () => {
    const decisions = completeDecisions(support);
    const payload = assembleAgentPayload(support, decisions);

    expect(payload.provider_id).toBe("openai");
    expect(payload.model).toBe(decisions[support.assembly.modelStepId]);
  });

  it("sends the tunables Lyzr requires", () => {
    const payload = assembleAgentPayload(support, completeDecisions(support));

    // Both are `*REQUIRED` in the OpenAPI schema — omitting them is a 422.
    expect(typeof payload.temperature).toBe("number");
    expect(typeof payload.top_p).toBe("number");
  });

  it("always enables conversational memory", () => {
    // Regression guard. `features: []` is the schema default and produces an
    // agent that asks for the customer's email, is given it, and then asks
    // again on the next turn. Every agent built here is conversational.
    for (const campaign of CAMPAIGNS.filter((c) => !c.locked)) {
      const payload = assembleAgentPayload(campaign, completeDecisions(campaign));
      expect(payload.features, campaign.id).toContainEqual(
        expect.objectContaining({ type: "SHORT_TERM_MEMORY" }),
      );
    }
  });

  it("uses the exact case Lyzr validates against", () => {
    // Lowercase `short_term_memory` is accepted at create, stored on the record,
    // and then silently ignored at inference. Verified by two-turn recall.
    const { features } = assembleAgentPayload(support, completeDecisions(support));
    expect(features.map((f) => f.type)).toEqual(["SHORT_TERM_MEMORY"]);
  });

  it("maps each decision onto the field its campaign declares", () => {
    const decisions = completeDecisions(support);
    const payload = assembleAgentPayload(support, decisions);

    expect(payload.name).toBe(decisions[support.assembly.nameStepId]);
    expect(payload.agent_role).toBe(decisions[support.assembly.roleStepId]);
    expect(payload.agent_goal).toBe(decisions[support.assembly.goalStepId]);
  });

  it("trims whitespace out of the values it sends", () => {
    const decisions = completeDecisions(support);
    decisions[support.assembly.nameStepId] = "  Aurora Support  ";

    expect(assembleAgentPayload(support, decisions).name).toBe("Aurora Support");
  });

  it("refuses to build when any decision is missing", () => {
    const decisions = completeDecisions(support);
    delete decisions[support.assembly.goalStepId];

    expect(() => assembleAgentPayload(support, decisions)).toThrow(AppError);
  });

  it("names every offending step so the UI can link straight to it", () => {
    const decisions = completeDecisions(support);
    delete decisions[support.assembly.goalStepId];
    delete decisions[support.assembly.roleStepId];

    try {
      assembleAgentPayload(support, decisions);
      expect.unreachable("should have thrown");
    } catch (error) {
      const appError = error as AppError;
      expect(appError.code).toBe("invalid_input");
      expect(appError.retryable).toBe(false);
      expect(Object.keys(appError.fields ?? {}).sort()).toEqual(
        [support.assembly.goalStepId, support.assembly.roleStepId].sort(),
      );
    }
  });

  it("refuses a decision that is present but invalid", () => {
    // The client validated it and the API validated it on save — this is the
    // backstop against a value that got in some other way.
    const decisions = completeDecisions(support);
    decisions[support.assembly.modelStepId] = "definitely-not-a-model";

    expect(() => assembleAgentPayload(support, decisions)).toThrow(AppError);
  });

  it("builds a valid payload for every shipped playable campaign", () => {
    for (const campaign of CAMPAIGNS.filter((c) => !c.locked)) {
      const payload = assembleAgentPayload(campaign, completeDecisions(campaign));
      expect(payload.name.length, campaign.id).toBeGreaterThan(0);
      expect(payload.model.length, campaign.id).toBeGreaterThan(0);
      expect(payload.provider_id.length, campaign.id).toBeGreaterThan(0);
      expect(payload.agent_instructions.length, campaign.id).toBeGreaterThan(50);
    }
  });
});

describe("composeInstructions", () => {
  /**
   * The honesty rule is a platform guarantee, not campaign content — an agent
   * with no tools will otherwise announce that it has escalated, forwarded or
   * filed something, and the customer waits for a reply nobody knows to send.
   * Observed on a real build. These assertions exist so it can't be quietly
   * dropped, and so no campaign can opt out of it.
   */
  it("appends the no-actions clause to every campaign", () => {
    for (const campaign of CAMPAIGNS.filter((c) => !c.locked)) {
      const text = composeInstructions(campaign, completeDecisions(campaign));
      expect(text, campaign.id).toContain(NO_ACTIONS_CLAUSE);
    }
  });

  it("forbids the specific false claims, by word", () => {
    // Naming them individually: a reworded clause that drops "escalated" would
    // still pass a vaguer assertion while reopening the exact hole.
    for (const verb of ["escalated", "forwarded", "flagged", "filed", "notified"]) {
      expect(NO_ACTIONS_CLAUSE.toLowerCase()).toContain(verb);
    }
  });

  it("forbids the future tense, not just the past", () => {
    // Observed against a live agent: told only not to claim it *had* escalated,
    // it answered "I will escalate this to a human" — obeying the letter and
    // telling the same lie in the future tense. The clause has to close both.
    const text = NO_ACTIONS_CLAUSE.toLowerCase();
    expect(text).toContain("never promise that you will");
    expect(text).toContain("no later step");
  });

  it("puts the clause last, so the developer's own words lead", () => {
    const text = composeInstructions(support, completeDecisions(support));
    expect(text.endsWith(NO_ACTIONS_CLAUSE)).toBe(true);
  });

  it("scopes the clause to acting, not to knowing", () => {
    // Retrieval (web search, a KB) changes what an agent can look up but never
    // lets it send mail or change a record. If this clause ever claims the agent
    // cannot look things up, it becomes a lie the moment search ships.
    expect(NO_ACTIONS_CLAUSE.toLowerCase()).not.toContain("search");
    expect(NO_ACTIONS_CLAUSE.toLowerCase()).not.toContain("browse");
  });

  it("opens with the campaign preamble", () => {
    const text = composeInstructions(support, completeDecisions(support));
    expect(text.startsWith(support.assembly.instructionsPreamble.trim())).toBe(true);
  });

  it("includes every declared section under its heading, in order", () => {
    const text = composeInstructions(support, completeDecisions(support));
    const positions = support.assembly.instructions.map(({ heading }) => text.indexOf(`## ${heading}`));

    expect(positions.every((p) => p > -1)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("carries the developer's own words through verbatim", () => {
    const decisions = completeDecisions(support);
    decisions.rules = "Never quote a price you were not given.";

    expect(composeInstructions(support, decisions)).toContain(
      "Never quote a price you were not given.",
    );
  });

  it("skips sections with no answer instead of emitting an empty heading", () => {
    const decisions = completeDecisions(support);
    const [first] = support.assembly.instructions;
    delete decisions[first!.stepId];

    const text = composeInstructions(support, decisions);
    expect(text).not.toContain(`## ${first!.heading}`);
  });
});

describe("outstandingSteps", () => {
  it("is empty for a complete build", () => {
    expect(outstandingSteps(support, completeDecisions(support))).toEqual([]);
  });

  it("returns unanswered steps in flow order", () => {
    const decisions = completeDecisions(support);
    const ids = allSteps(support).map((s) => s.id);
    delete decisions[ids[4]!];
    delete decisions[ids[1]!];

    expect(outstandingSteps(support, decisions).map((s) => s.id)).toEqual([ids[1], ids[4]]);
  });
});

describe("decisionLabel", () => {
  it("shows the human label for a select rather than its raw value", () => {
    const providerStep = allSteps(support).find((s) => s.id === support.assembly.modelStepId)!;
    const option = providerStep.input.options![1]!;

    expect(decisionLabel(support, providerStep.id, { [providerStep.id]: option.value })).toBe(
      option.label,
    );
  });

  it("returns undefined for a decision that hasn't been made", () => {
    expect(decisionLabel(support, "name", {})).toBeUndefined();
  });
});
