"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Route-level error boundary — the last line of defence against a blank screen.
 * Anything that escapes a component lands here with a real recovery path.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("[boundary]", error);
  }, [error]);

  return (
    <main
      id="main"
      className="grid min-h-dvh place-items-center px-5 py-16"
    >
      <div className="w-full max-w-md rounded-(--radius-panel) border border-line bg-surface p-7 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-(--radius-card) border border-danger-line bg-danger-soft">
          <AlertTriangle className="size-5 text-danger" aria-hidden />
        </div>

        <h1 className="mt-5 font-display text-[21px] font-semibold">Something broke here.</h1>
        <p className="mx-auto mt-2.5 max-w-[42ch] text-[13px] leading-relaxed text-ink-dim">
          Your progress is saved — every decision is written the moment you make it, so nothing was
          lost. Try this screen again, or head back and pick up from the campaign list.
        </p>

        {error.digest && (
          <p className="mt-4 font-mono text-[10.5px] text-ink-mute">ref {error.digest}</p>
        )}

        <div className="mt-7 flex flex-wrap justify-center gap-2.5">
          <Button onClick={reset}>
            <RefreshCw className="size-4" aria-hidden />
            Try again
          </Button>
          <Button asChild variant="subtle">
            <Link href="/campaigns">
              <ArrowLeft className="size-4" aria-hidden />
              Back to campaigns
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
