"use client";

import { Code2, Route } from "lucide-react";
import { toast } from "sonner";
import { useBuildStore } from "@/store/build-provider";
import { analyzeAgentSource, sourceIsDirty } from "@/lib/agent-source";
import type { BuildMode } from "@/lib/mode";
import { cn } from "@/lib/cn";

/**
 * The one control that swaps how you build.
 *
 * Present on both surfaces and in the same place, because the point is that
 * neither is a mode you get trapped in: every decision lives in the same rows
 * either way, so switching costs nothing and loses nothing.
 *
 * The single exception it has to guard is unsaved editor text — valid fields are
 * already on the server, but a half-written paragraph is not, and leaving for
 * the guided screens without a word would be exactly the sort of quiet data loss
 * this codebase avoids elsewhere.
 */
const OPTIONS: { value: BuildMode; label: string; icon: typeof Route; hint: string }[] = [
  { value: "guided", label: "Guided", icon: Route, hint: "One decision at a time, with the trade-offs" },
  { value: "code", label: "Code", icon: Code2, hint: "The whole agent as an editable file" },
];

export function ModeToggle({ className }: { className?: string }) {
  const mode = useBuildStore((s) => s.mode);
  const setMode = useBuildStore((s) => s.setMode);
  const campaign = useBuildStore((s) => s.campaign);
  const decisions = useBuildStore((s) => s.build.decisions);
  const text = useBuildStore((s) => s.source.text);

  function select(next: BuildMode) {
    if (next === mode) return;

    if (next === "guided" && sourceIsDirty(analyzeAgentSource(campaign, text), decisions)) {
      toast("Your file has unsaved changes. They're kept — save them when you come back.");
    }

    setMode(next);
  }

  return (
    <div
      role="group"
      aria-label="How you want to build"
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-(--radius-control) border border-line bg-surface-2 p-0.5",
        className,
      )}
    >
      {OPTIONS.map((option) => {
        const active = option.value === mode;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => select(option.value)}
            aria-pressed={active}
            title={option.hint}
            className={cn(
              "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[7px] px-2.5 text-[12px] font-semibold",
              "transition-colors duration-200 pointer-coarse:h-10",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-bright",
              active
                ? "bg-accent-soft text-accent-text shadow-[0_0_0_1px_var(--color-accent-line)_inset]"
                : "text-ink-mute hover:text-ink",
            )}
          >
            <option.icon className="size-3.5" aria-hidden />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
