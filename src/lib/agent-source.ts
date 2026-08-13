import type { Campaign, Step } from "@/campaigns/types";
import { allSteps, findMissionForStep, missionIndex } from "@/campaigns/types";
import type { DecisionMap } from "@/lib/assemble";
import { validateStep, type StepValue } from "@/lib/validation";

/**
 * The agent as a *file*.
 *
 * The guided flow asks for one decision at a time. This module is the other way
 * in: the same decisions, rendered as an editable source document, parsed back
 * into the same `DecisionMap`. Nothing downstream can tell which route a
 * decision arrived by — assembly, validation, XP, and launch are untouched.
 *
 * The format is deliberately the smallest thing that can hold prose safely:
 *
 *   [stepId]  # terse constraint hint
 *   everything until the next field header, verbatim
 *
 * One rule, no exceptions: **a field's value is every line between its header
 * and the next header, exactly as typed.** No comment stripping inside a block,
 * no escaping, no continuation markers. That matters because half these fields
 * are multi-line prose a developer pastes from a handbook — a format that eats
 * a line beginning with `#` would silently change what the agent is allowed to
 * say. Comments live on the header line and in the preamble, where they can
 * never be mistaken for content.
 *
 * Like `src/lib/validation.ts`, this is pure and JSON-safe so the *same* code
 * runs in the editor (instant diagnostics as you type) and in the route handler
 * (the authority that decides what gets written).
 */

/** Generous, but bounded — the largest campaign field caps at 8,000 characters. */
export const SOURCE_MAX_CHARS = 80_000;

/**
 * A field header. The trailing `#` comment is ours (constraint hints, rewritten
 * on every regeneration), which is why it's ignored rather than preserved.
 *
 * Requiring the line to be *only* a header is what keeps prose safe: a line
 * reading `[name] is the field you want` inside a knowledge block is content,
 * not structure.
 */
const HEADER = /^\[([A-Za-z0-9_.-]+)\][ \t]*(?:#.*)?$/;

export type SourceSection = {
  /** As written in the file — may not be a real step id. */
  id: string;
  /** 1-based line of the `[id]` header. */
  headerLine: number;
  /** 1-based line of the first content line (equals `headerLine + 1` even when empty). */
  firstContentLine: number;
  /** 1-based line of the last content line, or `headerLine` when the block is empty. */
  lastContentLine: number;
  /** The block's content with surrounding blank lines removed. Otherwise verbatim. */
  value: string;
};

export type SourceDiagnostic = {
  /** 1-based. Always points at a line that exists in the document. */
  line: number;
  severity: "error" | "warning";
  /** Present when the diagnostic belongs to a real campaign step. */
  stepId?: string;
  message: string;
};

export type ParsedSource = {
  sections: SourceSection[];
  /** Raw text per *known* step id. Last block wins when a field is repeated. */
  values: Record<string, string>;
  /** Structural problems only — unknown fields and duplicates. */
  diagnostics: SourceDiagnostic[];
};

/** One campaign step, seen through the document. */
export type SourceField = {
  step: Step;
  /** Absent when the developer deleted the block. */
  section?: SourceSection;
  /** Where to put the cursor when this field is selected. */
  line: number;
  /** What the document says, before validation. */
  raw: string;
  status: "valid" | "invalid" | "missing";
  /** Set on `valid` — the value that would be persisted. */
  value?: StepValue;
  /** Set on `invalid`/`missing` — the campaign's own message. */
  message?: string;
};

export type SourceAnalysis = {
  fields: SourceField[];
  /** Only the fields that pass their own step's rule. What a save writes. */
  values: Record<string, StepValue>;
  /** Failures, keyed by step id. What a save refuses to write. */
  invalid: Record<string, string>;
  /** Structural + per-field, sorted by line. What the Problems panel shows. */
  diagnostics: SourceDiagnostic[];
  errorCount: number;
  warningCount: number;
};

/* ── Serialise ─────────────────────────────────────────────────────────────── */

/**
 * Renders the developer's decisions as a document.
 *
 * Field order is campaign order, so the file reads in the same sequence the
 * guided flow asks in — switching modes mid-build lands you somewhere
 * recognisable rather than in a differently-shaped version of your own agent.
 */
export function serializeAgentSource(campaign: Campaign, decisions: DecisionMap): string {
  const lines: string[] = [...preamble(campaign)];

  for (const step of allSteps(campaign)) {
    const hint = fieldHint(step);
    lines.push("", `[${step.id}]${hint ? `  # ${hint}` : ""}`);

    const raw = decisions[step.id];
    const value = raw === undefined ? "" : normalise(String(raw));
    lines.push(...(value === "" ? [""] : value.split("\n")));
  }

  return `${lines.join("\n")}\n`;
}

function preamble(campaign: Campaign): string[] {
  return [
    `# ${sourceFilename(campaign)} — your agent, as one file.`,
    "#",
    "# Each [field] below is one decision. Everything between a field header",
    "# and the next one is that field's value, verbatim — including blank lines,",
    "# indentation, and any '#' you paste in. Comments only live up here and on",
    "# header lines.",
    "#",
    "# Save with Ctrl/Cmd+S. Fields are checked against the same rules the guided",
    "# flow uses; valid ones are written, the rest stay here with a problem.",
  ];
}

/** The filename shown on the tab. Derived from the campaign, never hardcoded. */
export function sourceFilename(campaign: Campaign): string {
  return `${campaign.id}.agent`;
}

/**
 * The one-line constraint note on a header. Terse on purpose — the real
 * guidance (why the decision exists, what people get wrong) is the campaign's
 * `guidance`, shown live beside the cursor rather than pasted into the file
 * where it would go stale the moment a rule changes.
 */
export function fieldHint(step: Step): string {
  const rule = step.rule;

  if (rule.kind === "enum") return `one of: ${rule.values.join(" | ")}`;

  if (rule.kind === "number") {
    const range =
      rule.min !== undefined && rule.max !== undefined
        ? `${rule.min}–${rule.max}`
        : rule.min !== undefined
          ? `min ${rule.min}`
          : rule.max !== undefined
            ? `max ${rule.max}`
            : "number";
    return `${rule.integer ? "whole number" : "number"} · ${range}`;
  }

  const parts: string[] = [];
  if (rule.min !== undefined && rule.max !== undefined) {
    parts.push(`${rule.min}–${rule.max} chars`);
  } else if (rule.min !== undefined) {
    parts.push(`at least ${rule.min} chars`);
  } else if (rule.max !== undefined) {
    parts.push(`up to ${rule.max} chars`);
  }
  if (step.input.kind === "select") parts.push("free text, or one of the suggestions");
  return parts.join(" · ");
}

/* ── Parse ─────────────────────────────────────────────────────────────────── */

export function parseAgentSource(campaign: Campaign, text: string): ParsedSource {
  const lines = normalise(text).split("\n");
  const known = new Set(allSteps(campaign).map((s) => s.id));

  const sections: SourceSection[] = [];
  const diagnostics: SourceDiagnostic[] = [];

  let open: { id: string; headerLine: number; content: string[] } | null = null;

  const close = () => {
    if (!open) return;
    const { value, offset, length } = trimBlock(open.content);
    sections.push({
      id: open.id,
      headerLine: open.headerLine,
      firstContentLine: open.headerLine + 1 + offset,
      lastContentLine: length > 0 ? open.headerLine + offset + length : open.headerLine,
      value,
    });
    open = null;
  };

  lines.forEach((line, index) => {
    const match = HEADER.exec(line);
    if (match) {
      close();
      open = { id: match[1]!, headerLine: index + 1, content: [] };
      return;
    }
    // Anything before the first header is the preamble and is dropped. Anything
    // inside a block is content, no matter what it looks like.
    if (open) open.content.push(line);
  });
  close();

  const values: Record<string, string> = {};
  const lastFor = new Map<string, number>();

  for (const section of sections) {
    if (!known.has(section.id)) {
      diagnostics.push({
        line: section.headerLine,
        severity: "warning",
        message: `[${section.id}] isn't a field in this campaign, so it's ignored. Delete it or fix the spelling.`,
      });
      continue;
    }
    lastFor.set(section.id, section.headerLine);
    values[section.id] = section.value;
  }

  // Duplicates: the last block wins (it's what the developer most recently
  // wrote), and every earlier one is flagged where it sits rather than reported
  // as a vague file-level problem.
  for (const section of sections) {
    if (!known.has(section.id)) continue;
    const winner = lastFor.get(section.id)!;
    if (section.headerLine !== winner) {
      diagnostics.push({
        line: section.headerLine,
        severity: "warning",
        stepId: section.id,
        message: `Duplicate [${section.id}] — the block on line ${winner} is the one that counts.`,
      });
    }
  }

  return { sections, values, diagnostics };
}

/**
 * Strips leading and trailing blank lines from a block, reporting how far the
 * content moved so diagnostics can still point at the right line.
 */
function trimBlock(content: string[]): { value: string; offset: number; length: number } {
  let start = 0;
  let end = content.length;
  while (start < end && content[start]!.trim() === "") start += 1;
  while (end > start && content[end - 1]!.trim() === "") end -= 1;

  const slice = content.slice(start, end);
  return { value: slice.join("\n"), offset: start, length: slice.length };
}

/** CRLF and lone CR both become LF — a pasted Windows handbook must not double-space. */
function normalise(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

/* ── Analyse ───────────────────────────────────────────────────────────────── */

/**
 * The document, judged. One call gives the editor its problem list, the
 * inspector its per-field state, and the route handler the exact set of values
 * it is allowed to write.
 */
export function analyzeAgentSource(campaign: Campaign, text: string): SourceAnalysis {
  const parsed = parseAgentSource(campaign, text);
  const diagnostics = [...parsed.diagnostics];

  const fields: SourceField[] = [];
  const values: Record<string, StepValue> = {};
  const invalid: Record<string, string> = {};

  // Last block wins, matching `values` above.
  const sectionFor = new Map<string, SourceSection>();
  for (const section of parsed.sections) sectionFor.set(section.id, section);

  for (const step of allSteps(campaign)) {
    const section = sectionFor.get(step.id);
    const raw = section?.value ?? "";
    const line = section?.headerLine ?? 1;

    if (!section) {
      fields.push({
        step,
        line,
        raw,
        status: "missing",
        message: `Missing field [${step.id}] — ${step.label}.`,
      });
      invalid[step.id] = `Missing field [${step.id}].`;
      diagnostics.push({
        line,
        severity: "error",
        stepId: step.id,
        message: `[${step.id}] is missing from the file — ${step.label.toLowerCase()}.`,
      });
      continue;
    }

    const outcome = validateStep(step, raw);
    if (outcome.valid) {
      values[step.id] = outcome.value;
      fields.push({ step, section, line, raw, status: "valid", value: outcome.value });
      continue;
    }

    invalid[step.id] = outcome.message;
    fields.push({ step, section, line, raw, status: "invalid", message: outcome.message });
    diagnostics.push({
      line: raw === "" ? section.headerLine : section.firstContentLine,
      severity: "error",
      stepId: step.id,
      message: outcome.message,
    });
  }

  diagnostics.sort((a, b) => a.line - b.line || a.severity.localeCompare(b.severity));

  return {
    fields,
    values,
    invalid,
    diagnostics,
    errorCount: diagnostics.filter((d) => d.severity === "error").length,
    warningCount: diagnostics.filter((d) => d.severity === "warning").length,
  };
}

/* ── Edits the UI performs on the developer's behalf ───────────────────────── */

/**
 * Rewrites one field's block, or appends it when the block isn't there.
 *
 * Used by the inspector's starters and enum options — the same one-tap starting
 * points the guided flow offers, landing in the file instead of in a form field.
 * Everything outside the target block is left byte-for-byte alone.
 */
export function setFieldValue(
  campaign: Campaign,
  text: string,
  stepId: string,
  value: string,
): string {
  const parsed = parseAgentSource(campaign, text);
  const lines = normalise(text).split("\n");
  const step = allSteps(campaign).find((s) => s.id === stepId);

  // Last block wins on read, so it's the one an edit has to land in.
  const section = [...parsed.sections].reverse().find((s) => s.id === stepId);
  const body = normalise(value).split("\n");

  if (!section) {
    const hint = step ? fieldHint(step) : "";
    return `${[...lines, "", `[${stepId}]${hint ? `  # ${hint}` : ""}`, ...body].join("\n")}\n`;
  }

  // Replace everything after the header up to the next header (or EOF), keeping
  // the developer's own header comment if they changed it.
  const nextHeaderIndex = lines.findIndex(
    (line, index) => index > section.headerLine - 1 && HEADER.test(line),
  );
  const end = nextHeaderIndex === -1 ? lines.length : nextHeaderIndex;

  const tail = end === lines.length ? [] : [""];
  return [...lines.slice(0, section.headerLine), ...body, ...tail, ...lines.slice(end)].join("\n");
}

/**
 * Appends every field the document has lost. The quick fix behind "a field is
 * missing" — deleting a block is easy to do by accident and tedious to undo by
 * hand, and the alternative (regenerating the file) would throw away the
 * developer's other unsaved edits.
 */
export function appendMissingFields(campaign: Campaign, text: string): string {
  const parsed = parseAgentSource(campaign, text);
  const present = new Set(parsed.sections.map((s) => s.id));
  const missing = allSteps(campaign).filter((step) => !present.has(step.id));
  if (missing.length === 0) return text;

  const lines = normalise(text).replace(/\n+$/, "").split("\n");
  for (const step of missing) {
    const hint = fieldHint(step);
    lines.push("", `[${step.id}]${hint ? `  # ${hint}` : ""}`, "");
  }
  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}

/* ── Lookups the editor needs ──────────────────────────────────────────────── */

/** The field whose block contains a 1-based line — what the inspector follows. */
export function fieldAtLine(analysis: SourceAnalysis, line: number): SourceField | undefined {
  let match: SourceField | undefined;
  for (const field of analysis.fields) {
    if (!field.section) continue;
    if (field.section.headerLine <= line) {
      if (!match?.section || field.section.headerLine > match.section.headerLine) match = field;
    }
  }
  return match;
}

/** Groups fields by the mission that asks for them, for the outline. */
export function fieldsByMission(
  campaign: Campaign,
  fields: SourceField[],
): { missionId: string; title: string; fields: SourceField[] }[] {
  const groups = new Map<string, SourceField[]>();

  for (const field of fields) {
    const mission = findMissionForStep(campaign, field.step.id);
    if (!mission) continue;
    const bucket = groups.get(mission.id) ?? [];
    bucket.push(field);
    groups.set(mission.id, bucket);
  }

  return [...groups.entries()]
    .sort((a, b) => missionIndex(campaign, a[0]) - missionIndex(campaign, b[0]))
    .map(([missionId, fields]) => ({
      missionId,
      title: campaign.missions.find((m) => m.id === missionId)?.title ?? missionId,
      fields,
    }));
}

/**
 * Does the document differ from what the server holds?
 *
 * Deliberately compared on *values*, not on text: reformatting the file, fixing
 * a typo in a comment, or adding a blank line is not an unsaved decision, and
 * telling someone they have unsaved work when they don't is how a save
 * indicator stops being believed.
 */
export function sourceIsDirty(analysis: SourceAnalysis, decisions: DecisionMap): boolean {
  return analysis.fields.some((field) => {
    const saved = decisions[field.step.id];
    if (field.status !== "valid") return saved !== undefined || field.raw.trim() !== "";
    return saved === undefined || String(saved) !== String(field.value);
  });
}

/** Fingerprint of the decisions a buffer was last synced against. */
export function decisionsFingerprint(campaign: Campaign, decisions: DecisionMap): string {
  return JSON.stringify(
    allSteps(campaign).map((step) => [step.id, decisions[step.id] ?? null]),
  );
}
