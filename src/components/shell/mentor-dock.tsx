"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { motion, useReducedMotion } from "motion/react";
import { Compass, CornerDownLeft, X } from "lucide-react";
import { useBuildStore } from "@/store/build-provider";
import { missionById } from "@/campaigns/types";
import { STAGE_LABEL } from "@/lib/flow";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/ui/field";
import { ErrorBlock, LoadingBlock } from "@/components/ui/states";
import { cn } from "@/lib/cn";

/**
 * The Mentor — reachable from every screen in the flow.
 *
 * It's a real Lyzr agent (see src/server/mentor.ts), not a stub, and it is
 * given the developer's actual position and decisions on every turn. Its
 * instructions tell it to guide rather than answer, which is why asking it
 * "just write it for me" gets you a question back.
 *
 * Built on Radix Dialog so the focus trap, escape-to-close, scroll lock and
 * `aria-modal` semantics come from the platform rather than being reinvented.
 */
export function MentorDock() {
  const open = useBuildStore((s) => s.mentor.open);
  const toggle = useBuildStore((s) => s.toggleMentor);
  const reduceMotion = useReducedMotion();

  return (
    <Dialog.Root open={open} onOpenChange={toggle}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className={cn(
            "fixed right-5 bottom-5 z-50 inline-flex cursor-pointer items-center gap-2.5",
            "rounded-full bg-linear-to-br from-accent-bright to-accent px-4 py-3",
            "text-[13px] font-semibold text-white",
            "shadow-[0_10px_30px_-8px_rgba(124,58,237,0.7)]",
            "transition-transform duration-200 hover:-translate-y-0.5",
            "motion-reduce:hover:translate-y-0",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-bright",
          )}
        >
          <Compass className="size-4" strokeWidth={2} aria-hidden />
          Ask Mentor
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        {/* Scrim strong enough to isolate the panel from the workspace behind it. */}
        <Dialog.Overlay className="fixed inset-0 z-60 bg-black/55 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in" />

        <Dialog.Content
          className={cn(
            "fixed inset-y-0 right-0 z-70 flex w-full max-w-[400px] flex-col",
            "border-l border-line bg-surface shadow-2xl",
            "focus:outline-none",
          )}
          asChild
        >
          {/* Slides in on open. Radix unmounts the content on close, so there is
              no exit to animate — and relying on one would only risk the panel
              sticking around. */}
          <motion.div
            initial={reduceMotion ? false : { x: "100%" }}
            animate={{ x: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
          >
            <MentorPanel />
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function MentorPanel() {
  const campaign = useBuildStore((s) => s.campaign);
  const stage = useBuildStore((s) => s.stage);
  const missionId = useBuildStore((s) => s.missionId);
  const stepIndex = useBuildStore((s) => s.stepIndex);
  const mentor = useBuildStore((s) => s.mentor);
  const ask = useBuildStore((s) => s.askMentor);
  const toggle = useBuildStore((s) => s.toggleMentor);

  const [draft, setDraft] = React.useState("");
  const [lastAttempt, setLastAttempt] = React.useState<string | null>(null);
  const endRef = React.useRef<HTMLDivElement>(null);

  const mission = missionById(campaign, missionId);
  const step = stage === "mission" ? mission?.steps[stepIndex] : undefined;

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [mentor.messages.length, mentor.pending]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || mentor.pending) return;
    setDraft("");
    setLastAttempt(trimmed);
    await ask(trimmed);
  }

  /** Openers tied to the current step — the questions people actually have. */
  const prompts = step
    ? [
        `What's the real trade-off on "${step.label}"?`,
        "What would you push back on in my answer?",
      ]
    : ["What am I actually deciding in this campaign?", "What do most people get wrong here?"];

  return (
    <>
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="grid size-9 place-items-center rounded-(--radius-control) bg-linear-to-br from-accent-bright to-accent"
          >
            <Compass className="size-4.5 text-white" strokeWidth={2} />
          </span>
          <div>
            <Dialog.Title className="font-display text-[14px] font-semibold">Mentor</Dialog.Title>
            <Dialog.Description className="font-mono text-[10.5px] text-live">
              ● reading your build
            </Dialog.Description>
          </div>
        </div>
        <Dialog.Close asChild>
          <Button variant="ghost" size="icon" aria-label="Close mentor">
            <X className="size-4" aria-hidden />
          </Button>
        </Dialog.Close>
      </header>

      {/* Context strip — proves it knows where you are, not just that it exists. */}
      <div className="border-b border-line bg-accent-soft/40 px-4 py-2.5">
        <p className="font-mono text-[10.5px] leading-relaxed text-accent-text">
          {STAGE_LABEL[stage]}
          {mission && ` · ${mission.title}`}
          {step && ` · ${step.label}`}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {!mentor.loaded ? (
          <LoadingBlock label="Loading…" />
        ) : mentor.messages.length === 0 ? (
          <div className="flex flex-col gap-4">
            <div className="rounded-(--radius-card) border border-line bg-surface-2 p-3.5">
              <p className="text-[12.5px] leading-relaxed text-ink-dim">
                I can see which step you&rsquo;re on and what you&rsquo;ve chosen so far. Ask me
                about the trade-off, or paste what you&rsquo;re thinking and I&rsquo;ll push back on
                it.
              </p>
              <p className="mt-2.5 text-[11.5px] leading-relaxed text-ink-mute">
                I won&rsquo;t write your answer for you — that&rsquo;s the part worth doing.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              {prompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void send(prompt)}
                  className={cn(
                    "cursor-pointer rounded-(--radius-control) border border-line bg-surface-2",
                    "px-3 py-2.5 text-left text-[12px] text-ink-dim",
                    "transition-colors duration-200 hover:border-accent-line hover:text-accent-text",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-bright",
                  )}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {mentor.messages.map((message) => (
              <li
                key={message.id}
                className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[88%] rounded-(--radius-card) border px-3 py-2.5",
                    "text-[12.5px] leading-relaxed whitespace-pre-wrap",
                    message.role === "user"
                      ? "border-accent-line bg-accent-soft text-ink"
                      : "border-line bg-surface-2 text-ink-dim",
                  )}
                >
                  {message.content}
                </div>
              </li>
            ))}

            {mentor.pending && (
              <li className="flex justify-start">
                <div className="flex items-center gap-1.5 rounded-(--radius-card) border border-line bg-surface-2 px-3 py-3">
                  <span className="sr-only">Mentor is thinking</span>
                  {[0, 1, 2].map((index) => (
                    <span
                      key={index}
                      aria-hidden
                      className="size-1.5 animate-pulse rounded-full bg-ink-mute"
                      style={{ animationDelay: `${index * 160}ms` }}
                    />
                  ))}
                </div>
              </li>
            )}
          </ul>
        )}

        {mentor.error && (
          <ErrorBlock
            error={mentor.error}
            onRetry={
              mentor.error.retryable && lastAttempt ? () => void send(lastAttempt) : undefined
            }
            className="mt-4"
          />
        )}

        <div ref={endRef} />
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send(draft);
        }}
        className="flex items-end gap-2 border-t border-line p-3"
      >
        <label htmlFor="mentor-input" className="sr-only">
          Ask the mentor about this step
        </label>
        <TextArea
          id="mentor-input"
          rows={1}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send(draft);
            }
          }}
          placeholder="Ask about this step…"
          disabled={mentor.pending}
          className="min-h-11 resize-none font-sans text-[12.5px]"
        />
        <Button
          type="submit"
          size="icon"
          disabled={!draft.trim()}
          loading={mentor.pending}
          onClick={() => void 0}
        >
          <CornerDownLeft className="size-4" aria-hidden />
          <span className="sr-only">Send</span>
        </Button>
      </form>

      <button type="button" onClick={() => toggle(false)} className="sr-only">
        Close mentor
      </button>
    </>
  );
}
