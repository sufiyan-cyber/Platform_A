"use client";

import * as React from "react";
import { AlertTriangle, Inbox, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import type { ApiError } from "@/lib/api-error";

/**
 * The three states every async surface needs, in one place.
 *
 * Having them as shared components rather than inline JSX is what makes "loading
 * and error states for every async surface" checkable — if a surface renders
 * data, it imports from here, and reviewers can see at a glance when one doesn't.
 */

/** Shimmer placeholder. Always sized to the content it replaces, so no CLS. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "rounded-md bg-linear-to-r from-surface-2 via-surface-3 to-surface-2",
        "bg-[length:200%_100%] animate-shimmer",
        className,
      )}
    />
  );
}

export function LoadingBlock({ label, className }: { label: string; className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex items-center justify-center gap-3 p-10 text-ink-mute", className)}
    >
      <Loader2 className="size-4 animate-spin" aria-hidden />
      <span className="text-[13px]">{label}</span>
    </div>
  );
}

/**
 * Failure state. Always names a recovery path — a retry action when the error is
 * retryable, and honest guidance when it isn't.
 */
export function ErrorBlock({
  error,
  onRetry,
  className,
}: {
  error: ApiError;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-start gap-3 rounded-(--radius-card) border border-danger-line bg-danger-soft p-4",
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
        <div>
          <p className="text-[13px] leading-relaxed text-ink">{error.message}</p>
          {error.code === "not_configured" && (
            <p className="mt-2 font-mono text-[11.5px] leading-relaxed text-ink-mute">
              Add LYZR_API_KEY to .env, then restart the dev server.
            </p>
          )}
        </div>
      </div>

      {error.retryable && onRetry && (
        <Button variant="subtle" size="sm" onClick={onRetry}>
          <RefreshCw className="size-3.5" aria-hidden />
          Try again
        </Button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
  className,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-3 px-6 py-12 text-center", className)}>
      <div className="grid size-11 place-items-center rounded-(--radius-card) border border-line bg-surface-2">
        <Inbox className="size-5 text-ink-mute" aria-hidden />
      </div>
      <div>
        <p className="font-display text-[15px] font-semibold text-ink">{title}</p>
        <p className="mx-auto mt-1.5 max-w-[42ch] text-[12.5px] leading-relaxed text-ink-dim">
          {body}
        </p>
      </div>
      {action}
    </div>
  );
}
