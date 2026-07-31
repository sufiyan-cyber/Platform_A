import * as React from "react";
import { cn } from "@/lib/cn";

/** The one container primitive. Everything sits in one of these. */
export function Panel({
  className,
  inset,
  ...props
}: React.ComponentPropsWithoutRef<"section"> & { inset?: boolean }) {
  return (
    <section
      className={cn(
        "rounded-(--radius-panel) border border-line",
        inset ? "bg-surface-2" : "bg-surface",
        className,
      )}
      {...props}
    />
  );
}

export function PanelTitle({ className, ...props }: React.ComponentPropsWithoutRef<"h2">) {
  return <h2 className={cn("label-caps", className)} {...props} />;
}

/** Small monospace metadata pill. Never used for interactive things. */
export function Chip({
  className,
  tone = "neutral",
  ...props
}: React.ComponentPropsWithoutRef<"span"> & {
  tone?: "neutral" | "accent" | "live" | "warn" | "danger";
}) {
  const tones = {
    neutral: "border-line bg-surface-2 text-ink-dim",
    accent: "border-accent-line bg-accent-soft text-accent-text",
    live: "border-live-line bg-live-soft text-live",
    warn: "border-warn/30 bg-warn-soft text-warn",
    danger: "border-danger-line bg-danger-soft text-danger",
  } as const;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] leading-none tnum",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
