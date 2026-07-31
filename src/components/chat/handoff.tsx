"use client";

import * as React from "react";
import { UserRoundCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/field";
import { cn } from "@/lib/cn";

/**
 * "Hand this to a human."
 *
 * The control is deliberately *outside* the conversation. The agent cannot
 * trigger it, cannot mention it into existence, and cannot be talked into
 * pretending it fired — a handoff happens because a person pressed a button, and
 * that is the entire reason the resulting record can be trusted.
 *
 * Shared by the builder's chat and the public share page. The two differ only in
 * what `onSubmit` does with the reason; the promise made to the person pressing
 * it has to read identically in both places.
 */
export function HandoffControl({
  onSubmit,
  label = "Hand to a human",
  className,
}: {
  /** Resolves true when the record was written. */
  onSubmit: (reason: string) => Promise<boolean>;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function submit() {
    if (pending) return;
    setPending(true);
    const ok = await onSubmit(reason.trim());
    setPending(false);
    if (ok) {
      setReason("");
      setOpen(false);
    }
  }

  if (!open) {
    return (
      <div className={cn("flex justify-end border-t border-line px-3 pt-2", className)}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOpen(true)}
          className="text-ink-mute hover:text-ink"
        >
          <UserRoundCheck className="size-3.5" aria-hidden />
          {label}
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("border-t border-line bg-surface-2 p-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12.5px] font-medium text-ink">Hand this conversation to a human</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className={cn(
            "grid size-6 shrink-0 cursor-pointer place-items-center rounded-md text-ink-mute",
            "transition-colors duration-200 hover:bg-surface-3 hover:text-ink",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-bright",
          )}
        >
          <X className="size-3.5" aria-hidden />
          <span className="sr-only">Cancel handoff</span>
        </button>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="mt-2 flex items-center gap-2"
      >
        <label htmlFor="handoff-reason" className="sr-only">
          Anything to add for the person picking this up
        </label>
        <TextInput
          id="handoff-reason"
          ref={inputRef}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
          placeholder="Anything to add? (optional)"
          maxLength={500}
          disabled={pending}
        />
        <Button type="submit" size="sm" loading={pending} className="shrink-0">
          Send
        </Button>
      </form>

      {/* Says exactly what leaves with the request. A handoff that quietly took
          more than it showed would undercut the point of the record. */}
      <p className="mt-2 text-[11px] leading-relaxed text-ink-mute">
        The last few turns of this conversation go with it, timestamped. Nothing is emailed —
        this writes a record you can open.
      </p>
    </div>
  );
}
