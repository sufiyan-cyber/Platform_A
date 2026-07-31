"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check } from "lucide-react";
import type { ArtifactLine, ArtifactToken, Campaign, TokenClass } from "@/campaigns/types";
import { findStep, missionIndex } from "@/campaigns/types";
import type { DecisionMap } from "@/lib/assemble";
import { cn } from "@/lib/cn";

/**
 * The evolving artifact.
 *
 * This is the spine of the experience: the developer never writes the config,
 * they fill slots in it, and it visibly grows as missions unlock. Three slot
 * states, each unmistakable at a glance:
 *
 *   pending  — dim, dashed, showing the placeholder
 *   active   — violet, dashed, mirroring what they're typing right now
 *   filled   — green, solid, showing the committed value
 *
 * The slot is a live mirror rather than an input. Nesting real form controls
 * inside a code view fights every accessibility and layout expectation; the
 * actual control lives in the decision panel below, and clicking a slot focuses
 * it. What you get from the mirror — seeing your answer land in the config
 * character by character — is the part that actually matters.
 */
export function ArtifactPanel({
  campaign,
  decisions,
  currentMissionId,
  activeStepId,
  draft,
  onSlotActivate,
  className,
}: {
  campaign: Campaign;
  decisions: DecisionMap;
  currentMissionId: string;
  activeStepId?: string;
  draft?: string;
  onSlotActivate?: () => void;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const currentIndex = missionIndex(campaign, currentMissionId);

  const visible = campaign.artifact.lines.filter(
    (line) => missionIndex(campaign, line.fromMissionId) <= currentIndex,
  );

  return (
    <div
      className={cn(
        "overflow-hidden rounded-(--radius-card) border border-line bg-code",
        className,
      )}
    >
      {/* Window chrome — decorative only, hidden from assistive tech. */}
      <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-3.5 py-2.5">
        <span aria-hidden className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
        </span>
        <span className="ml-1.5 font-mono text-[11.5px] text-ink-dim">
          {campaign.artifact.filename}
        </span>
        <span className="ml-auto font-mono text-[10.5px] text-ink-mute tnum">
          {visible.length} lines
        </span>
      </div>

      {/* Horizontal overflow is contained here so the page body never scrolls. */}
      <div className="overflow-x-auto py-3">
        <pre className="min-w-max font-mono text-[12.5px] leading-[2.05]">
          {visible.map((line, index) => (
              <motion.div
                key={line.id}
                // Newly-revealed lines grow in. `height: auto` is safe here
                // because every line is exactly one row tall. Lines are only
                // ever added, never removed, so no exit animation is needed.
                initial={reduceMotion ? false : { opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                className="flex items-start"
              >
                <span
                  aria-hidden
                  className="w-10 shrink-0 select-none pr-3.5 text-right text-ink-mute tnum"
                >
                  {line.tokens.length > 0 ? index + 1 : ""}
                </span>
                <code
                  className="block whitespace-pre pr-4"
                  style={{ paddingLeft: `${line.indent * 20}px` }}
                >
                  {line.tokens.length === 0 ? (
                    " "
                  ) : (
                    line.tokens.map((token, tokenIndex) => (
                      <TokenView
                        key={tokenIndex}
                        token={token}
                        campaign={campaign}
                        decisions={decisions}
                        activeStepId={activeStepId}
                        draft={draft}
                        onSlotActivate={onSlotActivate}
                      />
                    ))
                  )}
                </code>
              </motion.div>
            ))}
        </pre>
      </div>
    </div>
  );
}

const TOKEN_COLOR: Record<TokenClass, string> = {
  kw: "text-[#c792ea]",
  str: "text-[#c3e88d]",
  fn: "text-[#82aaff]",
  prop: "text-[#e0e0ea]",
  punc: "text-ink-mute",
  cmt: "text-[#6f9470]", // 5.7:1 on --color-code

  plain: "text-ink-dim",
};

function TokenView({
  token,
  campaign,
  decisions,
  activeStepId,
  draft,
  onSlotActivate,
}: {
  token: ArtifactToken;
  campaign: Campaign;
  decisions: DecisionMap;
  activeStepId?: string;
  draft?: string;
  onSlotActivate?: () => void;
}) {
  if (token.t === "text") {
    return <span className={TOKEN_COLOR[token.cls ?? "plain"]}>{token.v}</span>;
  }

  const step = findStep(campaign, token.stepId);
  const committed = decisions[token.stepId];
  const isActive = activeStepId === token.stepId;

  // While active, mirror the draft; otherwise show what's actually committed.
  const raw = isActive ? (draft ?? "") : committed !== undefined ? String(committed) : "";
  const hasValue = raw.trim().length > 0;

  const display = hasValue
    ? formatValue(raw, step?.input.kind === "number")
    : // Placeholders get clipped too — a campaign's example sentence would
      // otherwise stretch the code column far wider than any real value.
      clip(step?.input.placeholder ?? step?.label ?? "…", 34);

  const state = hasValue && !isActive ? "filled" : isActive ? "active" : "pending";

  return (
    <button
      type="button"
      onClick={onSlotActivate}
      // Not a tab stop: the real control is right below and already in the tab
      // order. A second stop for the same decision is noise for keyboard users.
      tabIndex={-1}
      aria-hidden
      className={cn(
        "mx-0.5 inline-flex max-w-[46ch] items-center gap-1.5 rounded-md border px-2 py-0.5 align-middle",
        "transition-colors duration-200",
        onSlotActivate && "cursor-pointer",
        state === "filled" && "border-live-line bg-live-soft text-live",
        state === "active" && "border-dashed border-accent-bright bg-accent-soft text-accent-text",
        state === "pending" && "border-dashed border-line-strong bg-surface-2/60 text-ink-mute",
      )}
      title={hasValue ? raw : undefined}
    >
      {state === "filled" && <Check className="size-3 shrink-0" strokeWidth={3} aria-hidden />}
      <span className="truncate">{display}</span>
      {state === "active" && (
        <span
          aria-hidden
          className="ml-0.5 inline-block h-3.5 w-px shrink-0 animate-pulse bg-accent-bright"
        />
      )}
    </button>
  );
}

/**
 * Values become one-line literals: newlines collapse to `⏎`, strings get quotes,
 * numbers don't, and anything long is cut so a 1,200-character rules block can't
 * blow out the code column.
 */
function formatValue(raw: string, isNumber: boolean): string {
  const flat = raw.replace(/\s*\n\s*/g, " ⏎ ").replace(/\s+/g, " ").trim();
  const clipped = clip(flat, 44);
  return isNumber ? clipped : `"${clipped}"`;
}

function clip(value: string, max: number): string {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
