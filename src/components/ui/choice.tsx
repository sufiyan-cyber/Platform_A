"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import type { SelectOption } from "@/campaigns/types";

/**
 * Constrained choices are rendered as a radio group of cards rather than a
 * `<select>`.
 *
 * Reasoning: each option carries a one-line consequence, and a native dropdown
 * hides exactly the information the developer needs to choose well. Cards also
 * give real touch targets and let the trade-off be visible at the moment of
 * decision, which is the entire point of the product.
 *
 * It stays a real radio group underneath — arrow keys, roving focus, and screen
 * reader semantics all come from the platform rather than being reimplemented.
 */
export function ChoiceGroup({
  name,
  options,
  value,
  onChange,
  describedBy,
  invalid,
}: {
  name: string;
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  describedBy?: string;
  invalid?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      className="flex flex-col gap-2"
    >
      {options.map((option) => {
        const selected = value === option.value;
        const id = `${name}-${slug(option.value)}`;

        return (
          <label
            key={option.value}
            htmlFor={id}
            className={cn(
              "group relative flex cursor-pointer items-start gap-3 rounded-(--radius-card) border p-3.5",
              "transition-[border-color,background-color] duration-200",
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent-bright",
              selected
                ? "border-accent-bright bg-accent-soft"
                : "border-line bg-surface-2 hover:border-line-strong hover:bg-surface-3",
            )}
          >
            <input
              id={id}
              type="radio"
              name={name}
              value={option.value}
              checked={selected}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />

            {/* Radio indicator. Fixed size so selection never shifts layout. */}
            <span
              aria-hidden
              className={cn(
                "mt-0.5 grid size-4.5 shrink-0 place-items-center rounded-full border transition-colors duration-200",
                selected ? "border-accent-bright bg-accent" : "border-line-strong bg-transparent",
              )}
            >
              {selected && <Check className="size-3 text-white" strokeWidth={3} />}
            </span>

            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span
                  className={cn(
                    "font-mono text-[13px] font-medium",
                    selected ? "text-accent-text" : "text-ink",
                  )}
                >
                  {option.label}
                </span>
                {option.meta && (
                  <span className="font-mono text-[10.5px] text-ink-mute">{option.meta}</span>
                )}
              </span>
              <span className="mt-1 block text-[12.5px] leading-relaxed text-ink-dim">
                {option.hint}
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

function slug(value: string): string {
  return value.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 40);
}
