"use client";

import * as React from "react";
import { ArrowUpRight, Check, CircleAlert, CircleDot, Lightbulb, Wand } from "lucide-react";
import type { SourceField } from "@/lib/agent-source";
import { Chip, Panel, PanelTitle } from "@/components/ui/panel";
import { cn } from "@/lib/cn";

/**
 * The guidance panel, following the cursor.
 *
 * This is what stops the editor being a downgrade. The guided flow explains each
 * decision beside the field it belongs to; here the same `guidance` data tracks
 * whichever block the caret is in, so nobody loses the *why* by choosing to type
 * instead of click.
 *
 * The starters and suggested values are the same campaign data the guided inputs
 * offer, and they behave the same way: one tap fills the block and it stays
 * fully editable. That's the point of the editor — the suggestions are a
 * starting position, not a menu you have to pick from.
 */
export function FieldInspector({
  field,
  onInsert,
  onJump,
}: {
  field?: SourceField;
  onInsert: (stepId: string, value: string) => void;
  onJump: (line: number) => void;
}) {
  if (!field) {
    return (
      <Panel className="p-4">
        <PanelTitle>Field</PanelTitle>
        <p className="mt-3 text-[12.5px] leading-relaxed text-ink-mute">
          Put the cursor inside a <code className="font-mono text-ink-dim">[field]</code> block and
          everything this platform knows about that decision shows up here.
        </p>
      </Panel>
    );
  }

  const { step } = field;
  const options = step.input.kind === "select" ? (step.input.options ?? []) : [];
  const starters = step.input.starters ?? [];

  return (
    <Panel className="overflow-hidden">
      <div className="border-b border-line px-4 py-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-mono text-[11.5px] text-accent-text">[{step.id}]</p>
            <h2 className="mt-1 font-display text-[15px] leading-tight font-semibold">
              {step.label}
            </h2>
          </div>
          <StatusChip field={field} />
        </div>

        <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink-dim">{step.prompt}</p>

        {field.section && (
          <button
            type="button"
            onClick={() => onJump(field.section!.headerLine)}
            className={cn(
              "mt-3 inline-flex cursor-pointer items-center gap-1.5 font-mono text-[11px] text-ink-mute",
              "transition-colors duration-200 hover:text-accent-text",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-bright",
            )}
          >
            <ArrowUpRight className="size-3.5" aria-hidden />
            line {field.section.headerLine}
          </button>
        )}
      </div>

      <div className="flex max-h-[520px] flex-col gap-4 overflow-y-auto p-4">
        {field.status !== "valid" && field.message && (
          <p className="flex items-start gap-2 rounded-(--radius-control) border border-danger-line bg-danger-soft px-3 py-2.5 text-[12px] leading-relaxed text-danger">
            <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
            {field.message}
          </p>
        )}

        <section>
          <PanelTitle>Why this decision</PanelTitle>
          <p className="mt-2 text-[12.5px] leading-relaxed text-ink-dim">{step.guidance.why}</p>
        </section>

        {options.length > 0 && (
          <section>
            <PanelTitle>Suggested values</PanelTitle>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-mute">
              Written into the block as-is. Rewrite them afterwards — the rule below is the only
              thing that has to hold.
            </p>
            <ul className="mt-2.5 flex flex-col gap-1.5">
              {options.map((option) => (
                <li key={option.value}>
                  <InsertButton
                    label={option.label}
                    meta={option.meta}
                    hint={option.hint}
                    active={field.raw.trim() === option.value.trim()}
                    onClick={() => onInsert(step.id, option.value)}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}

        {starters.length > 0 && (
          <section>
            <PanelTitle>Starting points</PanelTitle>
            <ul className="mt-2.5 flex flex-col gap-1.5">
              {starters.map((starter) => (
                <li key={starter.label}>
                  <InsertButton
                    label={starter.label}
                    icon={Wand}
                    active={field.raw.trim() === starter.value.trim()}
                    onClick={() => onInsert(step.id, starter.value)}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}

        {step.guidance.tradeoff && (
          <section>
            <PanelTitle>{step.guidance.tradeoff.title}</PanelTitle>
            <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
              {step.guidance.tradeoff.columns.map((column) => (
                <div
                  key={column.label}
                  className={cn(
                    "rounded-(--radius-control) border p-2.5",
                    column.tone === "good"
                      ? "border-live-line bg-live-soft/40"
                      : column.tone === "costly"
                        ? "border-warn/25 bg-warn-soft/40"
                        : "border-line bg-surface-2",
                  )}
                >
                  <p className="font-mono text-[11px] text-ink">{column.label}</p>
                  <ul className="mt-1.5 flex flex-col gap-1">
                    {column.points.map((point) => (
                      <li key={point} className="text-[11.5px] leading-relaxed text-ink-mute">
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}

        {step.guidance.mistakes.length > 0 && (
          <section>
            <PanelTitle>Common mistakes</PanelTitle>
            <ul className="mt-2.5 flex flex-col gap-2">
              {step.guidance.mistakes.map((mistake) => (
                <li
                  key={mistake}
                  className="flex items-start gap-2 text-[12px] leading-relaxed text-ink-mute"
                >
                  <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-warn" aria-hidden />
                  {mistake}
                </li>
              ))}
            </ul>
          </section>
        )}

        {step.guidance.docs.length > 0 && (
          <section className="border-t border-line pt-3">
            <ul className="flex flex-col gap-1.5">
              {step.guidance.docs.map((doc) => (
                <li key={doc.href}>
                  <a
                    href={doc.href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1.5 text-[12px] text-accent-text underline-offset-4 hover:underline"
                  >
                    {doc.label}
                    <ArrowUpRight className="size-3.5" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Panel>
  );
}

function StatusChip({ field }: { field: SourceField }) {
  if (field.status === "valid") {
    return (
      <Chip tone="live">
        <Check className="size-3" strokeWidth={3} aria-hidden />
        valid
      </Chip>
    );
  }
  if (field.status === "missing") {
    return (
      <Chip tone="warn">
        <CircleDot className="size-3" aria-hidden />
        missing
      </Chip>
    );
  }
  return (
    <Chip tone="danger">
      <CircleAlert className="size-3" aria-hidden />
      invalid
    </Chip>
  );
}

function InsertButton({
  label,
  hint,
  meta,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  hint?: string;
  meta?: string;
  icon?: typeof Wand;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full cursor-pointer rounded-(--radius-control) border px-3 py-2 text-left",
        "transition-colors duration-200",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-bright",
        active
          ? "border-live-line bg-live-soft"
          : "border-line bg-surface-2 hover:border-accent-line hover:bg-accent-soft/40",
      )}
    >
      <span className="flex items-center gap-1.5">
        {Icon && <Icon className="size-3.5 shrink-0 text-ink-mute" aria-hidden />}
        <span className={cn("text-[12.5px] font-medium", active ? "text-live" : "text-ink")}>
          {label}
        </span>
        {meta && <span className="ml-auto font-mono text-[10.5px] text-ink-mute">{meta}</span>}
        {active && <Check className="ml-auto size-3.5 shrink-0 text-live" aria-hidden />}
      </span>
      {hint && <span className="mt-1 block text-[11.5px] leading-relaxed text-ink-mute">{hint}</span>}
    </button>
  );
}
