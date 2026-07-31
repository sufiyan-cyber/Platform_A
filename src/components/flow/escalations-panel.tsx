"use client";

import * as React from "react";
import { ChevronDown, UserRoundCheck } from "lucide-react";
import type { EscalationRecord } from "@/server/escalations";
import { Chip, Panel, PanelTitle } from "@/components/ui/panel";
import { cn } from "@/lib/cn";

/**
 * The handoff record, on the finale screen.
 *
 * This panel is the payoff for `NO_ACTIONS_CLAUSE`: the agent tells you plainly
 * that it cannot escalate anything, and then here is the escalation, with a
 * timestamp and the exact turns that produced it. The claim and the artefact
 * come from different places on purpose — the model produces the sentence, a
 * button produces the row, and only one of them is evidence.
 *
 * Rendered even when empty, because the empty state is what explains the control
 * to someone who hasn't pressed it yet.
 */
export function EscalationsPanel({ records }: { records: EscalationRecord[] | null }) {
  return (
    <Panel className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5">
        <PanelTitle>Handoffs</PanelTitle>
        {records && records.length > 0 && (
          <Chip tone="accent">
            {records.length} {records.length === 1 ? "record" : "records"}
          </Chip>
        )}
      </div>

      {records === null ? (
        <p className="px-4 py-5 text-[12px] text-ink-mute">Loading…</p>
      ) : records.length === 0 ? (
        <div className="px-4 py-5">
          <p className="text-[12.5px] leading-relaxed text-ink-dim">
            Nothing handed off yet.
          </p>
          <p className="mt-2 text-[11.5px] leading-relaxed text-ink-mute">
            Your agent has no tools, so it can never escalate on its own — and it&apos;s instructed
            to say so rather than pretend. The button under the chat is the real thing: it writes a
            record here, with the conversation attached.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {records.map((record) => (
            <EscalationRow key={record.id} record={record} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function EscalationRow({ record }: { record: EscalationRecord }) {
  const [open, setOpen] = React.useState(false);

  return (
    <li className="px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink">
          <UserRoundCheck className="size-3.5 text-accent-text" aria-hidden />
          {record.source === "visitor" ? "A visitor" : "You"}
        </span>
        <Chip tone={record.status === "open" ? "warn" : "neutral"}>{record.status}</Chip>
      </div>

      {/*
        `suppressHydrationWarning` because this formats in the viewer's locale and
        timezone, which the server render cannot know. The value is identical
        either way — only its presentation differs.
      */}
      <p
        suppressHydrationWarning
        className="mt-1 font-mono text-[10.5px] text-ink-mute tnum"
      >
        {new Date(record.createdAt).toLocaleString()}
      </p>

      {record.reason && (
        <p className="mt-2 border-l-2 border-accent-line pl-2.5 text-[12px] leading-relaxed text-ink-dim">
          {record.reason}
        </p>
      )}

      {record.transcript.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            aria-expanded={open}
            className={cn(
              "mt-2 inline-flex cursor-pointer items-center gap-1 rounded-md",
              "font-mono text-[10.5px] text-ink-mute transition-colors duration-200 hover:text-ink",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-bright",
            )}
          >
            <ChevronDown
              className={cn("size-3 transition-transform duration-200", open && "rotate-180")}
              aria-hidden
            />
            {record.transcript.length} turns attached
          </button>

          {open && (
            <ol className="mt-2 flex flex-col gap-1.5 rounded-(--radius-card) border border-line bg-surface-2 p-2.5">
              {record.transcript.map((turn, index) => (
                <li key={index} className="text-[11.5px] leading-relaxed">
                  <span className="font-mono text-[10px] text-ink-mute">
                    {turn.role === "user" ? "user" : "agent"}
                  </span>
                  <span className="mt-0.5 block whitespace-pre-wrap text-ink-dim">
                    {turn.content}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </li>
  );
}
