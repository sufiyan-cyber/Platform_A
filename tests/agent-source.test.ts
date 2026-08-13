import { describe, expect, it } from "vitest";
import {
  analyzeAgentSource,
  appendMissingFields,
  decisionsFingerprint,
  fieldAtLine,
  fieldsByMission,
  parseAgentSource,
  serializeAgentSource,
  setFieldValue,
  sourceFilename,
  sourceIsDirty,
} from "@/lib/agent-source";
import { CAMPAIGNS, getCampaign, isPlayable } from "@/campaigns";
import { allSteps, type Campaign } from "@/campaigns/types";

/**
 * The editor writes into the same `Decision` rows the guided flow writes into.
 * That only holds if the document round-trips exactly — so these tests are
 * mostly about *not* losing or altering a character on the way through, with
 * particular attention to the multi-line prose fields, which are the ones a
 * lossy format would quietly damage.
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

const playable = CAMPAIGNS.filter(isPlayable);
const support = getCampaign("support-desk")!;

describe("round trip", () => {
  it("recovers every decision, in every shipped campaign", () => {
    for (const campaign of playable) {
      const decisions = completeDecisions(campaign);
      const analysis = analyzeAgentSource(campaign, serializeAgentSource(campaign, decisions));

      expect(analysis.diagnostics, `${campaign.id} should serialise cleanly`).toEqual([]);
      // Compared as strings: the document has no types, so a number field comes
      // back through `validateStep`'s coercion rather than as the literal typed.
      for (const [stepId, value] of Object.entries(decisions)) {
        expect(String(analysis.values[stepId]), `${campaign.id}/${stepId}`).toBe(String(value));
      }
    }
  });

  it("keeps multi-line values byte-for-byte, blank lines and all", () => {
    const knowledge = [
      "REFUNDS",
      "Full refund within 14 days.",
      "",
      "PLANS",
      "Starter $19/mo · Team $49/mo per seat.",
      "  indented line kept as typed",
    ].join("\n");

    const decisions = { ...completeDecisions(support), knowledge };
    const analysis = analyzeAgentSource(support, serializeAgentSource(support, decisions));

    expect(analysis.values.knowledge).toBe(knowledge);
  });

  it("treats a '#' line inside a field as content, not as a comment", () => {
    // The failure this guards against is silent and serious: a pasted handbook
    // with markdown headings would lose the lines the agent needs most.
    const knowledge = ["# Refund policy", "Full refund within 14 days.", "## Plans", "Starter $19."]
      .join("\n")
      .padEnd(70, ".");

    const decisions = { ...completeDecisions(support), knowledge };
    const analysis = analyzeAgentSource(support, serializeAgentSource(support, decisions));

    expect(analysis.values.knowledge).toBe(knowledge);
  });

  it("does not treat a bracketed phrase inside prose as a field header", () => {
    const text = [
      "[name]",
      "Aurora Support",
      "",
      "[knowledge]",
      "Tell the customer [name] is unavailable and route to [scope] instead.",
      "That line above must survive as written, brackets and all.",
      "Padding so the field clears its minimum length requirement here.",
    ].join("\n");

    const parsed = parseAgentSource(support, text);

    expect(parsed.values.knowledge).toContain("[name] is unavailable");
    expect(parsed.sections.map((s) => s.id)).toEqual(["name", "knowledge"]);
  });

  it("normalises CRLF so a file pasted from Windows doesn't double-space", () => {
    const parsed = parseAgentSource(support, "[name]\r\nAurora Support\r\n");
    expect(parsed.values.name).toBe("Aurora Support");
  });
});

describe("diagnostics", () => {
  it("reports a missing field as an error against the campaign's own label", () => {
    const decisions = completeDecisions(support);
    const text = serializeAgentSource(support, decisions).replace(
      /\[scope\][^\n]*\n[^[]*/,
      "",
    );

    const analysis = analyzeAgentSource(support, text);
    const field = analysis.fields.find((f) => f.step.id === "scope")!;

    expect(field.status).toBe("missing");
    expect(analysis.diagnostics.some((d) => d.stepId === "scope" && d.severity === "error")).toBe(
      true,
    );
    expect(analysis.values.scope).toBeUndefined();
  });

  it("uses the step's own validation message for an invalid value", () => {
    const analysis = analyzeAgentSource(support, "[provider]\ngpt-9\n");
    const field = analysis.fields.find((f) => f.step.id === "provider")!;

    expect(field.status).toBe("invalid");
    expect(field.message).toBe("Pick one of the listed options.");
    expect(analysis.invalid.provider).toBe("Pick one of the listed options.");
  });

  it("warns about an unknown field instead of silently dropping it", () => {
    const analysis = analyzeAgentSource(support, "[nmae]\nAurora\n");
    const warning = analysis.diagnostics.find((d) => d.severity === "warning");

    expect(warning?.line).toBe(1);
    expect(warning?.message).toContain("[nmae]");
  });

  it("takes the last of a duplicated field and flags the earlier one", () => {
    const analysis = analyzeAgentSource(support, "[name]\nFirst Desk\n\n[name]\nSecond Desk\n");

    expect(analysis.values.name).toBe("Second Desk");
    expect(
      analysis.diagnostics.some((d) => d.severity === "warning" && d.line === 1),
    ).toBe(true);
  });

  it("points an empty field's error at its header and a bad value's at its value", () => {
    const analysis = analyzeAgentSource(support, "[name]\n\n[role]\ntoo short\n");

    expect(analysis.diagnostics.find((d) => d.stepId === "name")?.line).toBe(1);
    expect(analysis.diagnostics.find((d) => d.stepId === "role")?.line).toBe(4);
  });
});

describe("edits made on the developer's behalf", () => {
  it("replaces one field and leaves every other byte alone", () => {
    const before = serializeAgentSource(support, completeDecisions(support));
    const after = setFieldValue(support, before, "name", "Tier-1 Desk");

    const parsedBefore = analyzeAgentSource(support, before);
    const parsedAfter = analyzeAgentSource(support, after);

    expect(parsedAfter.values.name).toBe("Tier-1 Desk");
    for (const step of allSteps(support)) {
      if (step.id === "name") continue;
      expect(parsedAfter.values[step.id], step.id).toEqual(parsedBefore.values[step.id]);
    }
  });

  it("writes a multi-line value into a field that had a single line", () => {
    const before = serializeAgentSource(support, completeDecisions(support));
    const rules = "One rule.\nAnother rule.\nA third rule that is long enough to pass.";

    const analysis = analyzeAgentSource(support, setFieldValue(support, before, "rules", rules));
    expect(analysis.values.rules).toBe(rules);
  });

  it("appends a field the document has lost rather than regenerating the file", () => {
    const before = "[name]\nAurora Support\n";
    const after = appendMissingFields(support, before);
    const analysis = analyzeAgentSource(support, after);

    expect(after.startsWith("[name]\nAurora Support")).toBe(true);
    expect(analysis.fields.every((f) => f.status !== "missing")).toBe(true);
    expect(analysis.values.name).toBe("Aurora Support");
  });

  it("appends rather than rewriting when setting a field with no block", () => {
    const analysis = analyzeAgentSource(
      support,
      setFieldValue(support, "[name]\nAurora Support\n", "provider", "gpt-4o"),
    );

    expect(analysis.values.name).toBe("Aurora Support");
    expect(analysis.values.provider).toBe("gpt-4o");
  });
});

describe("what the UI reads off the document", () => {
  it("resolves the field a line belongs to, including its last line", () => {
    const text = "[name]\nAurora Support\n\n[role]\nA specialist.\nA second line.\n";
    const analysis = analyzeAgentSource(support, text);

    expect(fieldAtLine(analysis, 1)?.step.id).toBe("name");
    expect(fieldAtLine(analysis, 2)?.step.id).toBe("name");
    expect(fieldAtLine(analysis, 4)?.step.id).toBe("role");
    expect(fieldAtLine(analysis, 6)?.step.id).toBe("role");
    // Above the first header there is no field — the preamble belongs to nobody.
    expect(fieldAtLine(analyzeAgentSource(support, "# preamble\n[name]\nX\n"), 1)).toBeUndefined();
  });

  it("groups every field under exactly one mission, in campaign order", () => {
    for (const campaign of playable) {
      const analysis = analyzeAgentSource(campaign, serializeAgentSource(campaign, {}));
      const groups = fieldsByMission(campaign, analysis.fields);

      expect(groups.map((g) => g.missionId)).toEqual(
        campaign.missions.filter((m) => m.steps.length > 0).map((m) => m.id),
      );
      expect(groups.flatMap((g) => g.fields).length).toBe(allSteps(campaign).length);
    }
  });

  it("names the file after the campaign rather than hardcoding one", () => {
    for (const campaign of playable) {
      expect(sourceFilename(campaign)).toBe(`${campaign.id}.agent`);
    }
  });
});

describe("dirty state", () => {
  const decisions = completeDecisions(support);
  const saved = serializeAgentSource(support, decisions);

  it("is clean for the document generated from those decisions", () => {
    expect(sourceIsDirty(analyzeAgentSource(support, saved), decisions)).toBe(false);
  });

  it("ignores comment and whitespace edits that change no value", () => {
    const reformatted = `# my own note\n${saved}\n\n`;
    expect(sourceIsDirty(analyzeAgentSource(support, reformatted), decisions)).toBe(false);
  });

  it("is dirty once a value actually differs", () => {
    const edited = setFieldValue(support, saved, "name", "Tier-1 Desk");
    expect(sourceIsDirty(analyzeAgentSource(support, edited), decisions)).toBe(true);
  });

  it("is dirty when a saved field has been emptied or broken", () => {
    const emptied = setFieldValue(support, saved, "role", "");
    expect(sourceIsDirty(analyzeAgentSource(support, emptied), decisions)).toBe(true);
  });

  it("fingerprints decisions so a stale buffer can be told from an unsaved one", () => {
    expect(decisionsFingerprint(support, decisions)).toBe(decisionsFingerprint(support, decisions));
    expect(decisionsFingerprint(support, decisions)).not.toBe(
      decisionsFingerprint(support, { ...decisions, name: "Something else" }),
    );
  });
});

describe("generated header hints", () => {
  it("lists every enum option, so the file states its own constraint", () => {
    for (const campaign of playable) {
      const text = serializeAgentSource(campaign, {});
      for (const step of allSteps(campaign)) {
        if (step.rule.kind !== "enum") continue;
        const header = text.split("\n").find((line) => line.startsWith(`[${step.id}]`))!;
        for (const value of step.rule.values) {
          expect(header, `${campaign.id}/${step.id}`).toContain(value);
        }
      }
    }
  });

  it("never lets a hint break the header it sits on", () => {
    // A hint containing a newline would split one field into two.
    for (const campaign of playable) {
      const text = serializeAgentSource(campaign, {});
      const parsed = parseAgentSource(campaign, text);
      expect(parsed.sections.map((s) => s.id)).toEqual(allSteps(campaign).map((s) => s.id));
      expect(parsed.diagnostics).toEqual([]);
    }
  });
});
