"use client";

import * as React from "react";
import { Wand2 } from "lucide-react";
import type { Step } from "@/campaigns/types";
import { Field, TextArea, TextInput, type FieldState } from "@/components/ui/field";
import { ChoiceGroup } from "@/components/ui/choice";
import { cn } from "@/lib/cn";

/**
 * The one decision, rendered.
 *
 * All four input kinds route through `<Field>`, so labelling, helper text, error
 * placement and ARIA wiring are identical no matter what a campaign asks for —
 * a campaign author can't accidentally ship an unlabelled input.
 */
export function DecisionInput({
  step,
  value,
  error,
  saved,
  disabled,
  onChange,
  onSubmit,
  inputRef,
}: {
  step: Step;
  value: string;
  error?: string;
  saved: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  inputRef?: React.RefObject<HTMLElement | null>;
}) {
  const id = `step-${step.id}`;
  const state: FieldState = error ? "invalid" : saved ? "valid" : "idle";
  const describedBy = error ? `${id}-error` : `${id}-helper`;

  /** Enter submits single-line inputs; textareas keep Enter for newlines. */
  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey && step.input.kind !== "textarea") {
      event.preventDefault();
      onSubmit();
    }
    // Cmd/Ctrl+Enter always submits, including from a textarea.
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      onSubmit();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Field
        id={id}
        label={step.prompt}
        helper={helperFor(step)}
        error={error}
        state={state}
        required
      >
        {step.input.kind === "select" ? (
          <ChoiceGroup
            name={id}
            options={step.input.options ?? []}
            value={value}
            onChange={onChange}
            describedBy={describedBy}
            invalid={Boolean(error)}
          />
        ) : step.input.kind === "textarea" ? (
          <TextArea
            id={id}
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            rows={step.input.rows ?? 4}
            placeholder={step.input.placeholder}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={onKeyDown}
            state={state}
            disabled={disabled}
            aria-describedby={describedBy}
            spellCheck
          />
        ) : (
          <TextInput
            id={id}
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type={step.input.kind === "number" ? "number" : "text"}
            inputMode={step.input.kind === "number" ? "numeric" : "text"}
            placeholder={step.input.placeholder}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={onKeyDown}
            state={state}
            disabled={disabled}
            aria-describedby={describedBy}
            autoComplete="off"
          />
        )}
      </Field>

      {/*
        Starters fill the field and leave it fully editable. The developer still
        owns the decision — they just don't have to start from an empty box,
        which is where most people stall.
      */}
      {step.input.starters && step.input.starters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-mute">
            <Wand2 className="size-3.5" aria-hidden />
            Start from
          </span>
          {step.input.starters.map((starter) => (
            <button
              key={starter.label}
              type="button"
              onClick={() => {
                onChange(starter.value);
                inputRef?.current?.focus();
              }}
              disabled={disabled}
              className={cn(
                "cursor-pointer rounded-full border border-line bg-surface-2 px-3 py-1.5",
                "text-[11.5px] text-ink-dim transition-colors duration-200",
                "hover:border-accent-line hover:bg-accent-soft hover:text-accent-text",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-bright",
                "disabled:cursor-not-allowed disabled:opacity-45",
              )}
            >
              {starter.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Turns the validation rule into a plain-English expectation, shown up front. */
function helperFor(step: Step): string | undefined {
  const { rule, input } = step;

  if (rule.kind === "number") {
    const bounds =
      rule.min !== undefined && rule.max !== undefined
        ? `between ${rule.min} and ${rule.max}`
        : rule.min !== undefined
          ? `${rule.min} or more`
          : rule.max !== undefined
            ? `${rule.max} or less`
            : "a number";
    return `Enter a whole number ${bounds}.`;
  }

  if (rule.kind === "string" && rule.min !== undefined && rule.min > 10) {
    return input.kind === "textarea"
      ? `At least ${rule.min} characters. Shift+Enter for a new line, Ctrl+Enter to continue.`
      : `At least ${rule.min} characters.`;
  }

  if (input.kind === "select") return "Pick one. You can change it later by coming back to this step.";

  return undefined;
}
