"use client";

import * as React from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { AlertTriangle, ArrowUpRight, BookOpen, Scale } from "lucide-react";
import type { Step, TradeoffColumn } from "@/campaigns/types";
import { cn } from "@/lib/cn";

/**
 * The side assistant.
 *
 * This is the difference between a guided build and a form. Every step carries
 * the reasoning behind it, the ways people get it wrong, and where to read more
 * — available at the moment of the decision, not in a doc somewhere else.
 *
 * "Why" sits above the tabs because it is the one thing that should never
 * require a click.
 */
export function GuidancePanel({ step, className }: { step: Step; className?: string }) {
  const hasTradeoff = Boolean(step.guidance.tradeoff);
  const [tab, setTab] = React.useState(hasTradeoff ? "tradeoff" : "mistakes");

  // Reset to the most relevant tab when the step changes.
  React.useEffect(() => {
    setTab(step.guidance.tradeoff ? "tradeoff" : "mistakes");
  }, [step.id, step.guidance.tradeoff]);

  return (
    <div className={cn("rounded-(--radius-panel) border border-line bg-surface", className)}>
      <div className="border-b border-line px-4 py-3.5">
        <p className="label-caps">Why this step</p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-dim">{step.guidance.why}</p>
      </div>

      <Tabs.Root value={tab} onValueChange={setTab}>
        <Tabs.List
          aria-label="Guidance"
          className="flex gap-1 border-b border-line px-2 pt-2"
        >
          {hasTradeoff && (
            <GuidanceTab value="tradeoff" icon={Scale}>
              Trade-off
            </GuidanceTab>
          )}
          <GuidanceTab value="mistakes" icon={AlertTriangle}>
            Mistakes
          </GuidanceTab>
          <GuidanceTab value="docs" icon={BookOpen}>
            Docs
          </GuidanceTab>
        </Tabs.List>

        {hasTradeoff && step.guidance.tradeoff && (
          <Tabs.Content value="tradeoff" className="p-4 focus-visible:outline-none">
            <p className="font-display text-[13px] font-semibold text-ink">
              {step.guidance.tradeoff.title}
            </p>
            <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {step.guidance.tradeoff.columns.map((column) => (
                <TradeoffCard key={column.label} column={column} />
              ))}
            </div>
          </Tabs.Content>
        )}

        <Tabs.Content value="mistakes" className="p-4 focus-visible:outline-none">
          <ul className="flex flex-col gap-3">
            {step.guidance.mistakes.map((mistake) => (
              <li key={mistake} className="flex gap-2.5 text-[12.5px] leading-relaxed text-ink-dim">
                <AlertTriangle
                  className="mt-0.5 size-3.5 shrink-0 text-warn"
                  strokeWidth={2}
                  aria-hidden
                />
                <span>{mistake}</span>
              </li>
            ))}
          </ul>
        </Tabs.Content>

        <Tabs.Content value="docs" className="p-4 focus-visible:outline-none">
          <ul className="flex flex-col gap-2">
            {step.guidance.docs.map((doc) => (
              <li key={doc.href}>
                <a
                  href={doc.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-(--radius-control) border border-line",
                    "bg-surface-2 px-3 py-2.5 text-[12.5px] text-ink-dim",
                    "transition-colors duration-200 hover:border-accent-line hover:text-accent-text",
                  )}
                >
                  {doc.label}
                  <ArrowUpRight className="size-3.5 shrink-0" aria-hidden />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

function GuidanceTab({
  value,
  icon: Icon,
  children,
}: {
  value: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  children: React.ReactNode;
}) {
  return (
    <Tabs.Trigger
      value={value}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1.5 rounded-t-(--radius-control) px-2.5 py-2",
        "text-[11.5px] font-medium text-ink-mute transition-colors duration-200",
        "hover:text-ink-dim",
        "data-[state=active]:bg-surface-2 data-[state=active]:text-accent-text",
        "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent-bright",
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {children}
    </Tabs.Trigger>
  );
}

function TradeoffCard({ column }: { column: TradeoffColumn }) {
  const toneRing = {
    neutral: "border-line",
    good: "border-live-line",
    costly: "border-warn/30",
  } as const;

  const toneText = {
    neutral: "text-ink",
    good: "text-live",
    costly: "text-warn",
  } as const;

  const tone = column.tone ?? "neutral";

  return (
    <div className={cn("rounded-(--radius-control) border bg-surface-2 p-3", toneRing[tone])}>
      <p className={cn("font-mono text-[11.5px] font-medium", toneText[tone])}>{column.label}</p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {column.points.map((point) => (
          <li key={point} className="flex gap-2 text-[11.5px] leading-snug text-ink-dim">
            <span aria-hidden className="mt-1.5 size-1 shrink-0 rounded-full bg-ink-mute" />
            {point}
          </li>
        ))}
      </ul>
    </div>
  );
}
