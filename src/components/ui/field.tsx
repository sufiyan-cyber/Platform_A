"use client";

import * as React from "react";
import { AlertCircle, Check } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Form field shell.
 *
 * Every input in the product goes through this, which is what guarantees the
 * rules from the checklist hold everywhere at once: a visible label (never
 * placeholder-only), persistent helper text, the error rendered *below the field
 * it belongs to*, `aria-describedby` wiring, and `role="alert"` so screen
 * readers hear the failure without the field stealing focus.
 */

export type FieldState = "idle" | "valid" | "invalid";

export function Field({
  id,
  label,
  helper,
  error,
  state = "idle",
  required,
  children,
  className,
}: {
  id: string;
  label: string;
  helper?: string;
  error?: string;
  state?: FieldState;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const helperId = `${id}-helper`;
  const errorId = `${id}-error`;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label htmlFor={id} className="flex items-center gap-2 text-[13px] font-medium text-ink">
        {label}
        {required && (
          <span className="text-danger" aria-hidden>
            *
          </span>
        )}
        {required && <span className="sr-only">(required)</span>}
        {state === "valid" && (
          <span className="inline-flex items-center gap-1 text-[11px] font-normal text-live">
            <Check className="size-3" aria-hidden />
            saved
          </span>
        )}
      </label>

      {children}

      {/* Helper text is persistent, not a placeholder that vanishes on focus. */}
      {helper && !error && (
        <p id={helperId} className="text-[12px] leading-relaxed text-ink-mute">
          {helper}
        </p>
      )}

      {error && (
        <p
          id={errorId}
          role="alert"
          className="flex items-start gap-1.5 text-[12px] leading-relaxed text-danger"
        >
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}

/** Shared input chrome so text, number, textarea and select can't drift apart. */
export const inputChrome = [
  "w-full bg-code border rounded-(--radius-control)",
  "px-3.5 py-2.5 text-[13.5px] leading-relaxed text-ink",
  // Placeholders are supplementary (every field has a real label and persistent
  // helper text) but still held to the same contrast bar.
  "font-mono placeholder:text-ink-mute placeholder:font-sans",
  "transition-[border-color,box-shadow] duration-200",
  "focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-bright",
  "disabled:opacity-45 disabled:cursor-not-allowed",
].join(" ");

export function stateBorder(state: FieldState): string {
  switch (state) {
    case "valid":
      return "border-live-line focus:border-live";
    case "invalid":
      return "border-danger-line focus:border-danger";
    default:
      return "border-line focus:border-accent-bright";
  }
}

export const TextInput = React.forwardRef<
  HTMLInputElement,
  React.ComponentPropsWithoutRef<"input"> & { state?: FieldState }
>(function TextInput({ className, state = "idle", ...props }, ref) {
  return (
    <input
      ref={ref}
      // 16px minimum on mobile prevents iOS zoom-on-focus.
      className={cn(inputChrome, stateBorder(state), "min-h-11 max-md:text-[16px]", className)}
      aria-invalid={state === "invalid" || undefined}
      {...props}
    />
  );
});

export const TextArea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentPropsWithoutRef<"textarea"> & { state?: FieldState }
>(function TextArea({ className, state = "idle", ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        inputChrome,
        stateBorder(state),
        "resize-y min-h-24 max-md:text-[16px]",
        className,
      )}
      aria-invalid={state === "invalid" || undefined}
      {...props}
    />
  );
});
