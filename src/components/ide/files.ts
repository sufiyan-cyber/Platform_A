import type { Campaign } from "@/campaigns/types";
import { allSteps, findMissionForStep } from "@/campaigns/types";
import type { DecisionMap } from "@/lib/assemble";
import { assembleAgentPayload, composeInstructions, previewPayload } from "@/lib/assemble";
import { sourceFilename } from "@/lib/agent-source";
import type { SourceAnalysis } from "@/lib/agent-source";
import type { Language } from "@/components/ide/highlight";

/**
 * The three read-only files beside the one you edit.
 *
 * All generated, all live: they re-render as you type, which is the entire
 * argument for having them. The guided flow shows the assembled payload once,
 * on the launch screen, as a reveal. In an editor the interesting version is the
 * one that updates while you work — you change a heading, you see the string the
 * model will actually read change with it.
 *
 * `campaign.md` is the load-bearing one. Dropping someone into a text editor
 * would otherwise cost them the guidance that makes this a guided product at
 * all, so every step's reasoning is written out here, generated from the same
 * campaign data the guided panels read.
 */

export type IdeFileKey = "source" | "payload" | "instructions" | "docs";

export type IdeFile = {
  key: IdeFileKey;
  name: string;
  language: Language;
  readOnly: boolean;
  /** One line under the tab bar explaining what this file is. */
  note: string;
};

export function ideFiles(campaign: Campaign): IdeFile[] {
  return [
    {
      key: "source",
      name: sourceFilename(campaign),
      language: "agent",
      readOnly: false,
      note: "Your agent. Every field here is one decision — edit freely, save with Ctrl/Cmd+S.",
    },
    {
      key: "payload",
      name: "agent.payload.json",
      language: "json",
      readOnly: true,
      note: "Generated. Byte-for-byte what gets POSTed to Lyzr when you launch.",
    },
    {
      key: "instructions",
      name: "instructions.md",
      language: "markdown",
      readOnly: true,
      note: "Generated. Your fields composed into the single instruction string the model reads every turn.",
    },
    {
      key: "docs",
      name: "campaign.md",
      language: "markdown",
      readOnly: true,
      note: "Why each field exists, what it costs to get wrong, and where the docs are.",
    },
  ];
}

/**
 * The payload preview.
 *
 * When the config can't be assembled it says so *in the file*, listing the
 * fields in the way — rather than showing an empty object, which would read as
 * "your agent is empty" instead of "you have two fields left".
 */
export function payloadFile(campaign: Campaign, analysis: SourceAnalysis): string {
  const blocked = analysis.fields.filter((field) => field.status !== "valid");

  if (blocked.length > 0) {
    return [
      "// Generated from your file. Nothing is sent until every field is valid.",
      `// ${blocked.length} field${blocked.length === 1 ? "" : "s"} still in the way:`,
      ...blocked.map((field) => `//   [${field.step.id}] — ${field.message ?? "not valid yet"}`),
      "",
      "{}",
      "",
    ].join("\n");
  }

  const decisions: DecisionMap = { ...analysis.values };

  try {
    return [
      "// Generated from your file. This is the request body, exactly.",
      "// POST /v3/agents/ — the API key is attached server-side, never here.",
      "",
      previewPayload(assembleAgentPayload(campaign, decisions)),
      "",
    ].join("\n");
  } catch {
    // assembleAgentPayload only throws on incomplete input, which the branch
    // above already covers — but a campaign edit could introduce a new step the
    // analysis and the assembly disagree about, and a blank pane would be a
    // worse answer than an honest one.
    return "// The config can't be assembled from this file yet.\n\n{}\n";
  }
}

export function instructionsFile(campaign: Campaign, analysis: SourceAnalysis): string {
  const decisions: DecisionMap = { ...analysis.values };
  const composed = composeInstructions(campaign, decisions);

  return [
    `<!-- Generated. This is agent_instructions, in full, as the model receives it. -->`,
    "",
    composed,
    "",
  ].join("\n");
}

/** Every step's guidance, as a document. The guided panels, in file form. */
export function docsFile(campaign: Campaign): string {
  const lines: string[] = [
    `# ${campaign.name}`,
    "",
    `> ${campaign.tagline}`,
    "",
    campaign.description,
    "",
    `Outcome: ${campaign.outcome}`,
    "",
    "Every field in the editor is one of the decisions below. The order is the",
    "order the guided flow asks in; nothing here is required reading, and nothing",
    "here is optional if you want the agent to be any good.",
    "",
  ];

  let currentMissionId: string | null = null;

  for (const step of allSteps(campaign)) {
    const mission = findMissionForStep(campaign, step.id);

    if (mission && mission.id !== currentMissionId) {
      currentMissionId = mission.id;
      lines.push("", `## ${mission.title}`, "", mission.description, "");
    }

    lines.push(`### [${step.id}] — ${step.label}`, "", step.prompt, "", `Why: ${step.guidance.why}`);

    if (step.input.kind === "select" && step.input.options?.length) {
      lines.push("", "Suggested values:");
      for (const option of step.input.options) {
        lines.push(`- ${option.label} — ${option.hint}`);
      }
    }

    if (step.guidance.tradeoff) {
      lines.push("", `Trade-off — ${step.guidance.tradeoff.title}:`);
      for (const column of step.guidance.tradeoff.columns) {
        lines.push(`- ${column.label}: ${column.points.join("; ")}`);
      }
    }

    if (step.guidance.mistakes.length > 0) {
      lines.push("", "Common mistakes:");
      for (const mistake of step.guidance.mistakes) lines.push(`- ${mistake}`);
    }

    if (step.guidance.docs.length > 0) {
      lines.push("", "Docs:");
      for (const doc of step.guidance.docs) lines.push(`- ${doc.label}: ${doc.href}`);
    }

    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}
