import { z } from "zod";
import type { Step, ValidationRule } from "@/campaigns/types";

/**
 * Compiles a campaign's declarative `ValidationRule` into a Zod schema.
 *
 * The point of the indirection: campaigns stay plain JSON-serialisable data, but
 * the *identical* rule runs in the browser (instant feedback as you type) and on
 * the server (the authority — the client is never trusted). One definition, no
 * drift.
 */
export function ruleToSchema(rule: ValidationRule): z.ZodType {
  switch (rule.kind) {
    case "enum": {
      // z.enum needs a non-empty tuple; fall back to a literal-union guard.
      const values = rule.values;
      return z
        .string()
        .refine((v) => values.includes(v), { message: "Pick one of the listed options." });
    }

    case "number": {
      let schema = z.number({ message: "Enter a number." });
      if (rule.integer) schema = schema.int("Use a whole number.");
      if (rule.min !== undefined) schema = schema.min(rule.min, `Must be ${rule.min} or higher.`);
      if (rule.max !== undefined) schema = schema.max(rule.max, `Must be ${rule.max} or lower.`);
      return schema;
    }

    case "string": {
      let schema = z.string({ message: "This one's required." }).trim();
      if (rule.min !== undefined) {
        schema = schema.min(
          rule.min,
          rule.min === 1 ? "This one's required." : `Give it at least ${rule.min} characters.`,
        );
      }
      if (rule.max !== undefined) {
        schema = schema.max(rule.max, `Keep it under ${rule.max} characters.`);
      }
      if (rule.pattern) {
        schema = schema.regex(
          new RegExp(rule.pattern),
          rule.patternMessage ?? "That format isn't accepted here.",
        );
      }
      if (rule.forbid?.length) {
        const forbidden = rule.forbid.map((f) => f.toLowerCase());
        return schema.refine((v) => !forbidden.includes(v.toLowerCase()), {
          message: "That's placeholder text — write something the agent can actually use.",
        });
      }
      return schema;
    }
  }
}

export type StepValue = string | number;

export type ValidationOutcome =
  | { valid: true; value: StepValue }
  | { valid: false; message: string };

/**
 * Validates one step's raw input. Empty input is *not* an error — it's simply
 * "not answered yet", which the UI shows as a neutral pending state rather than
 * shouting red at someone who hasn't started typing.
 */
export function validateStep(step: Step, raw: unknown): ValidationOutcome {
  const coerced = coerceForRule(step.rule, raw);

  if (coerced === undefined) {
    return { valid: false, message: "This one's required." };
  }

  const result = ruleToSchema(step.rule).safeParse(coerced);
  if (result.success) {
    return { valid: true, value: result.data as StepValue };
  }
  return {
    valid: false,
    message: result.error.issues[0]?.message ?? "That isn't valid yet.",
  };
}

/** True when the developer has typed nothing at all (distinct from invalid). */
export function isBlank(raw: unknown): boolean {
  return raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "");
}

/**
 * Numbers arrive from `<input>` as strings and from the DB as JSON. Normalise
 * before Zod so error messages stay about the *rule*, not about types.
 */
function coerceForRule(rule: ValidationRule, raw: unknown): StepValue | undefined {
  if (isBlank(raw)) return undefined;

  if (rule.kind === "number") {
    if (typeof raw === "number") return Number.isFinite(raw) ? raw : undefined;
    const parsed = Number(String(raw).trim());
    return Number.isFinite(parsed) ? parsed : NaN; // NaN → Zod reports "Enter a number."
  }

  return typeof raw === "string" ? raw : String(raw);
}

/** Validates every step of a mission at once. Used to gate "Continue". */
export function validateMission(
  steps: Step[],
  values: Record<string, unknown>,
): { complete: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  for (const step of steps) {
    const outcome = validateStep(step, values[step.id]);
    if (!outcome.valid) errors[step.id] = outcome.message;
  }
  return { complete: Object.keys(errors).length === 0, errors };
}
