"use client";

import { Check, ChevronRight, CircleAlert, TriangleAlert, Wand } from "lucide-react";
import type { SourceDiagnostic } from "@/lib/agent-source";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * Problems.
 *
 * Every message here is the campaign's own validation message — the same
 * sentence the guided flow shows under the same field. That's deliberate: an
 * editor that invents its own phrasing for "give it at least 60 characters"
 * would be a second source of truth about the rules, and the two would drift.
 *
 * Every row is a jump. A problem you can read but not navigate to is a problem
 * report, not a tool.
 */
export function ProblemsPanel({
  diagnostics,
  open,
  onToggle,
  onSelect,
  onAddMissing,
  canAddMissing,
  className,
}: {
  diagnostics: SourceDiagnostic[];
  open: boolean;
  onToggle: () => void;
  onSelect: (line: number) => void;
  onAddMissing: () => void;
  canAddMissing: boolean;
  className?: string;
}) {
  const errors = diagnostics.filter((d) => d.severity === "error").length;
  const warnings = diagnostics.length - errors;

  return (
    <div className={cn("border-t border-line bg-surface", className)}>
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className={cn(
            "inline-flex cursor-pointer items-center gap-1.5 rounded-[7px] px-1.5 py-1",
            "text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-mute",
            "transition-colors duration-200 hover:text-ink",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-bright",
          )}
        >
          <ChevronRight
            className={cn("size-3.5 transition-transform duration-200", open && "rotate-90")}
            aria-hidden
          />
          Problems
        </button>

        <span className="flex items-center gap-2.5 font-mono text-[11px] tnum">
          <span className={cn("inline-flex items-center gap-1", errors > 0 ? "text-danger" : "text-ink-mute")}>
            <CircleAlert className="size-3.5" aria-hidden />
            {errors}
          </span>
          <span className={cn("inline-flex items-center gap-1", warnings > 0 ? "text-warn" : "text-ink-mute")}>
            <TriangleAlert className="size-3.5" aria-hidden />
            {warnings}
          </span>
        </span>

        {canAddMissing && (
          <Button variant="ghost" size="sm" onClick={onAddMissing} className="ml-auto">
            <Wand className="size-3.5" aria-hidden />
            Add missing fields
          </Button>
        )}
      </div>

      {open && (
        <div className="max-h-44 overflow-y-auto border-t border-line">
          {diagnostics.length === 0 ? (
            <p className="flex items-center gap-2 px-4 py-3 text-[12px] text-live">
              <Check className="size-3.5" strokeWidth={3} aria-hidden />
              No problems. Every field passes the same rules the server enforces.
            </p>
          ) : (
            <ul>
              {diagnostics.map((diagnostic, index) => (
                <li key={`${diagnostic.line}-${index}`}>
                  <button
                    type="button"
                    onClick={() => onSelect(diagnostic.line)}
                    className={cn(
                      "flex w-full cursor-pointer items-start gap-2.5 px-4 py-2 text-left",
                      "border-b border-line/60 transition-colors duration-150 last:border-b-0",
                      "hover:bg-surface-2",
                      "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-bright",
                    )}
                  >
                    {diagnostic.severity === "error" ? (
                      <CircleAlert className="mt-px size-3.5 shrink-0 text-danger" aria-hidden />
                    ) : (
                      <TriangleAlert className="mt-px size-3.5 shrink-0 text-warn" aria-hidden />
                    )}
                    <span className="min-w-0 flex-1 text-[12px] leading-relaxed text-ink-dim">
                      {diagnostic.message}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-ink-mute tnum">
                      {diagnostic.stepId ? `[${diagnostic.stepId}] ` : ""}Ln {diagnostic.line}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
