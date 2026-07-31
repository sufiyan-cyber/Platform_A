import { describe, expect, it } from "vitest";
import { validateStep, validateMission, isBlank } from "@/lib/validation";
import type { Step } from "@/campaigns/types";
import { CAMPAIGNS } from "@/campaigns";
import { allSteps } from "@/campaigns/types";

/**
 * Step validation is the gate every decision passes through on both the client
 * and the server. If it drifts, invalid config reaches a real agent.
 */

function step(overrides: Partial<Step> & Pick<Step, "id" | "rule">): Step {
  return {
    label: "Test",
    sub: "sub",
    prompt: "prompt?",
    input: { kind: "text" },
    checklistLabel: "done",
    guidance: { why: "because", mistakes: [], docs: [] },
    ...overrides,
  } as Step;
}

describe("validateStep — strings", () => {
  const nameStep = step({
    id: "name",
    rule: {
      kind: "string",
      min: 2,
      max: 10,
      pattern: "^[\\w\\s.\\-']+$",
      patternMessage: "Letters only.",
      forbid: ["test"],
    },
  });

  it("accepts a valid value and returns it trimmed", () => {
    expect(validateStep(nameStep, "  Aurora  ")).toEqual({ valid: true, value: "Aurora" });
  });

  it("treats blank as required rather than as a format error", () => {
    expect(validateStep(nameStep, "")).toEqual({ valid: false, message: "This one's required." });
    expect(validateStep(nameStep, "   ")).toEqual({ valid: false, message: "This one's required." });
    expect(validateStep(nameStep, undefined)).toEqual({
      valid: false,
      message: "This one's required.",
    });
  });

  it("enforces the minimum length", () => {
    const result = validateStep(nameStep, "A");
    expect(result.valid).toBe(false);
  });

  it("enforces the maximum length", () => {
    expect(validateStep(nameStep, "a".repeat(11)).valid).toBe(false);
  });

  it("enforces the pattern with the campaign's own message", () => {
    const result = validateStep(nameStep, "no@sym");
    expect(result).toEqual({ valid: false, message: "Letters only." });
  });

  it("rejects forbidden placeholder words case-insensitively", () => {
    expect(validateStep(nameStep, "TEST").valid).toBe(false);
    expect(validateStep(nameStep, "Test").valid).toBe(false);
  });

  it("allows a forbidden word as part of a longer answer", () => {
    // "test" is banned as the whole value, not as a substring — otherwise
    // "Test Desk" would be rejected for no good reason.
    expect(validateStep(nameStep, "Test Desk").valid).toBe(true);
  });
});

describe("validateStep — numbers", () => {
  const budget = step({
    id: "budget",
    input: { kind: "number" },
    rule: { kind: "number", min: 50, max: 1200, integer: true },
  });

  it("coerces numeric strings from inputs", () => {
    expect(validateStep(budget, "250")).toEqual({ valid: true, value: 250 });
  });

  it("accepts real numbers from the database", () => {
    expect(validateStep(budget, 250)).toEqual({ valid: true, value: 250 });
  });

  it("rejects non-numeric text with a message about numbers", () => {
    const result = validateStep(budget, "many");
    expect(result).toEqual({ valid: false, message: "Enter a number." });
  });

  it("rejects out-of-range values at both ends", () => {
    expect(validateStep(budget, "10").valid).toBe(false);
    expect(validateStep(budget, "5000").valid).toBe(false);
  });

  it("rejects fractional values when the rule wants integers", () => {
    expect(validateStep(budget, "250.5").valid).toBe(false);
  });

  it("does not treat 0 as blank", () => {
    // The classic falsy bug: 0 is an answer, not an absence of one.
    const anyNumber = step({ id: "n", input: { kind: "number" }, rule: { kind: "number" } });
    expect(validateStep(anyNumber, 0)).toEqual({ valid: true, value: 0 });
    expect(isBlank(0)).toBe(false);
  });
});

describe("validateStep — enums", () => {
  const provider = step({
    id: "provider",
    input: { kind: "select" },
    rule: { kind: "enum", values: ["gpt-4o-mini", "gpt-4o"] },
  });

  it("accepts a listed option", () => {
    expect(validateStep(provider, "gpt-4o")).toEqual({ valid: true, value: "gpt-4o" });
  });

  it("rejects anything not on the list, including near-misses", () => {
    expect(validateStep(provider, "gpt-4").valid).toBe(false);
    expect(validateStep(provider, "GPT-4O").valid).toBe(false);
  });
});

describe("validateMission", () => {
  const steps = [
    step({ id: "a", rule: { kind: "string", min: 1 } }),
    step({ id: "b", rule: { kind: "string", min: 1 } }),
  ];

  it("is complete only when every step passes", () => {
    expect(validateMission(steps, { a: "x", b: "y" })).toEqual({ complete: true, errors: {} });
  });

  it("reports each failing step by id", () => {
    const result = validateMission(steps, { a: "x" });
    expect(result.complete).toBe(false);
    expect(Object.keys(result.errors)).toEqual(["b"]);
  });
});

describe("shipped campaign data", () => {
  it("has globally unique step ids within each campaign", () => {
    // Step ids are the DB key for decisions — a collision would silently
    // overwrite one decision with another.
    for (const campaign of CAMPAIGNS) {
      const ids = allSteps(campaign).map((s) => s.id);
      expect(new Set(ids).size, `${campaign.id} has duplicate step ids`).toBe(ids.length);
    }
  });

  it("references only real steps from every artifact slot", () => {
    for (const campaign of CAMPAIGNS) {
      const ids = new Set(allSteps(campaign).map((s) => s.id));
      for (const line of campaign.artifact.lines) {
        for (const token of line.tokens) {
          if (token.t === "slot") {
            expect(ids.has(token.stepId), `${campaign.id}: slot ${token.stepId}`).toBe(true);
          }
        }
      }
    }
  });

  it("references only real missions from every artifact line", () => {
    for (const campaign of CAMPAIGNS) {
      const missionIds = new Set(campaign.missions.map((m) => m.id));
      for (const line of campaign.artifact.lines) {
        if (campaign.missions.length === 0) continue;
        expect(missionIds.has(line.fromMissionId), `${campaign.id}: line ${line.id}`).toBe(true);
      }
    }
  });

  it("references only real missions from every level", () => {
    for (const campaign of CAMPAIGNS) {
      const missionIds = new Set(campaign.missions.map((m) => m.id));
      for (const level of campaign.levels) {
        for (const id of level.missionIds) {
          expect(missionIds.has(id), `${campaign.id}: level ${level.id} -> ${id}`).toBe(true);
        }
      }
    }
  });

  it("assigns every mission to exactly one level", () => {
    for (const campaign of CAMPAIGNS) {
      for (const mission of campaign.missions) {
        const levels = campaign.levels.filter((l) => l.missionIds.includes(mission.id));
        expect(levels.length, `${campaign.id}: mission ${mission.id}`).toBe(1);
      }
    }
  });

  it("gives select steps an enum rule matching their options", () => {
    for (const campaign of CAMPAIGNS) {
      for (const s of allSteps(campaign)) {
        if (s.input.kind !== "select") continue;
        const optionValues = (s.input.options ?? []).map((o) => o.value);
        expect(optionValues.length, `${campaign.id}/${s.id} has no options`).toBeGreaterThan(0);

        // Every option must actually pass the step's own rule, or the UI would
        // offer a choice the server then rejects.
        for (const value of optionValues) {
          expect(validateStep(s, value).valid, `${campaign.id}/${s.id}: ${value}`).toBe(true);
        }
      }
    }
  });

  it("gives every starter a value that passes its own step's rule", () => {
    for (const campaign of CAMPAIGNS) {
      for (const s of allSteps(campaign)) {
        for (const starter of s.input.starters ?? []) {
          expect(
            validateStep(s, starter.value).valid,
            `${campaign.id}/${s.id}: starter "${starter.label}"`,
          ).toBe(true);
        }
      }
    }
  });
});
