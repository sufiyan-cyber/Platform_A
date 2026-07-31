"use client";

import * as React from "react";
import { CornerDownLeft, MessageSquareOff, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/client-api";
import type { ApiError } from "@/lib/api-error";
import type { SearchSource } from "@/server/search";
import type { GroundingStatus } from "@/server/grounding";
import { Citations, GroundedThinking, GroundingNote } from "@/components/chat/citations";
import { HandoffControl } from "@/components/chat/handoff";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { TextArea } from "@/components/ui/field";
import { ErrorBlock } from "@/components/ui/states";
import { cn } from "@/lib/cn";

/**
 * Visitor-side chat on a shared agent.
 *
 * Nothing here is persisted, by design — the transcript lives in this component
 * and dies with the tab. What *does* persist for the visit is `visitorId`, an
 * opaque random string in sessionStorage: it namespaces the Lyzr session so the
 * agent can hold a conversation, while two people opening the same link never
 * see each other's messages.
 *
 * The remaining-message counter is shown honestly rather than hidden, so a
 * visitor who hits the cap understands what happened instead of thinking the
 * agent broke.
 */

type Turn = {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Citations for a grounded reply, and why there are none when there aren't. */
  sources?: SearchSource[];
  grounding?: GroundingStatus;
};

const VISITOR_KEY = "af_visitor_id";

/** Mirrors the owner-side prompts in chat-screen.tsx. */
const DEFAULT_PROMPTS = ["What can you help me with?", "I want a refund for last month."];
const GROUNDED_PROMPTS = ["What happened in AI this week?", "What can you actually verify for me?"];

/**
 * Random, unguessable, and *not* an identifier we could correlate with anything —
 * it exists only to keep one visit's conversation together.
 */
function readVisitorId(): string {
  try {
    const existing = sessionStorage.getItem(VISITOR_KEY);
    if (existing && /^[A-Za-z0-9_-]{8,64}$/.test(existing)) return existing;
  } catch {
    // Private mode or blocked storage — fall through to a per-mount id.
  }

  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const id = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

  try {
    sessionStorage.setItem(VISITOR_KEY, id);
  } catch {
    // Non-fatal: memory-only for this mount.
  }
  return id;
}

export function ShareChat({
  token,
  agentName,
  enabled,
  remaining: initialRemaining,
  grounded = false,
}: {
  token: string;
  agentName: string;
  enabled: boolean;
  remaining: number;
  /** The shared build's campaign declares `retrieval`. */
  grounded?: boolean;
}) {
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [draft, setDraft] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<ApiError | null>(null);
  const [lastAttempt, setLastAttempt] = React.useState<string | null>(null);
  const [remaining, setRemaining] = React.useState(initialRemaining);

  const visitorId = React.useRef<string | null>(null);
  const endRef = React.useRef<HTMLDivElement>(null);

  // Generated on the client only — `sessionStorage` and `crypto` don't exist
  // during the server render of this page.
  React.useEffect(() => {
    visitorId.current ??= readVisitorId();
  }, []);

  React.useEffect(() => {
    if (turns.length > 0 || pending) {
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [turns.length, pending]);

  const exhausted = remaining <= 0;
  const closed = !enabled || exhausted;

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending || closed) return;

    visitorId.current ??= readVisitorId();

    setDraft("");
    setError(null);
    setLastAttempt(trimmed);
    setPending(true);

    const echo: Turn = { id: `u-${Date.now()}`, role: "user", content: trimmed };
    setTurns((current) => [...current, echo]);

    const result = await api.post<{
      reply: string;
      remaining: number;
      sources?: SearchSource[];
      grounding?: GroundingStatus;
    }>(`/api/share/${encodeURIComponent(token)}/chat`, {
      message: trimmed,
      visitorId: visitorId.current,
    });

    setPending(false);

    if (!result.ok) {
      // Roll the echo back so a failed turn isn't left looking delivered.
      setTurns((current) => current.filter((t) => t.id !== echo.id));
      setError(result.error);
      setDraft(trimmed);
      // A refusal because the budget or the owner's switch closed the door
      // should also close the composer, not just show an error.
      if (result.error.code === "conflict") setRemaining(0);
      return;
    }

    setTurns((current) => [
      ...current,
      {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: result.data.reply,
        sources: result.data.sources,
        grounding: result.data.grounding,
      },
    ]);
    setRemaining(result.data.remaining);
    setLastAttempt(null);
  }

  return (
    <Panel className="flex min-h-[520px] flex-col overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-line px-4 py-3.5">
        <span
          aria-hidden
          className="grid size-7 place-items-center rounded-lg bg-linear-to-br from-accent-bright to-accent text-[12px] font-bold text-white"
        >
          {agentName.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium">{agentName}</p>
          <p className="font-mono text-[10.5px] text-live">● running on Lyzr</p>
        </div>
        {enabled && !exhausted && (
          <span className="shrink-0 font-mono text-[10.5px] text-ink-mute tnum">
            {remaining} left
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {turns.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 py-10 text-center">
            <div
              className={cn(
                "grid size-11 place-items-center rounded-(--radius-card) border",
                closed ? "border-line bg-surface-2" : "border-accent-line bg-accent-soft",
              )}
            >
              {closed ? (
                <MessageSquareOff className="size-5 text-ink-mute" strokeWidth={1.75} aria-hidden />
              ) : (
                <Sparkles className="size-5 text-accent-text" strokeWidth={1.75} aria-hidden />
              )}
            </div>

            {closed ? (
              <div>
                <p className="font-display text-[15px] font-semibold">
                  {exhausted && enabled ? "Out of demo messages." : "Replies are turned off."}
                </p>
                <p className="mx-auto mt-1.5 max-w-[44ch] text-[12.5px] leading-relaxed text-ink-dim">
                  {exhausted && enabled
                    ? "This link has used up the messages its owner allowed. The config below is still all here."
                    : "Whoever built this agent shared the config to read, not to talk to. Everything below is still live."}
                </p>
              </div>
            ) : (
              <>
                <div>
                  <p className="font-display text-[15px] font-semibold">Try it yourself.</p>
                  <p className="mx-auto mt-1.5 max-w-[44ch] text-[12.5px] leading-relaxed text-ink-dim">
                    {grounded
                      ? "This is the real agent, not a recording. It searches the web before it answers, and every source it used is linked under the reply."
                      : "This is the real agent, not a recording. Push on its rules and see whether they hold."}
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  {(grounded ? GROUNDED_PROMPTS : DEFAULT_PROMPTS).map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => void send(suggestion)}
                      className={cn(
                        "cursor-pointer rounded-full border border-line bg-surface-2 px-3 py-1.5",
                        "text-[11.5px] text-ink-dim transition-colors duration-200",
                        "hover:border-accent-line hover:bg-accent-soft hover:text-accent-text",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-bright",
                      )}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {turns.map((turn) => (
              <li
                key={turn.id}
                className={cn("flex", turn.role === "user" ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-(--radius-card) border px-3.5 py-2.5",
                    "text-[13px] leading-relaxed",
                    turn.role === "user"
                      ? "border-accent-line bg-accent-soft text-ink"
                      : "border-line bg-surface-2 text-ink-dim",
                  )}
                >
                  {/* See the note in chat-screen.tsx: pre-wrap stays on the text
                      so it can't leak into the citation markup below. */}
                  <div className="whitespace-pre-wrap">{turn.content}</div>
                  {turn.role === "assistant" && (
                    <>
                      <Citations sources={turn.sources ?? []} />
                      <GroundingNote status={turn.grounding} />
                    </>
                  )}
                </div>
              </li>
            ))}

            {pending && (
              <li className="flex justify-start">
                <div className="flex items-center gap-1.5 rounded-(--radius-card) border border-line bg-surface-2 px-3.5 py-3">
                  {grounded ? (
                    <GroundedThinking />
                  ) : (
                    <>
                      <span className="sr-only">The agent is replying</span>
                      {[0, 1, 2].map((index) => (
                        <span
                          key={index}
                          aria-hidden
                          className="size-1.5 animate-pulse rounded-full bg-ink-mute"
                          style={{ animationDelay: `${index * 160}ms` }}
                        />
                      ))}
                    </>
                  )}
                </div>
              </li>
            )}
          </ul>
        )}

        {error && (
          <ErrorBlock
            error={error}
            onRetry={error.retryable && lastAttempt ? () => void send(lastAttempt) : undefined}
            className="mt-4"
          />
        )}

        <div ref={endRef} />
      </div>

      {/*
        Outside the `closed` guard on purpose. A visitor who read the config and
        wants a person should be able to ask for one even on a link whose owner
        turned replies off — the handoff costs no upstream call, so there is
        nothing for the budget to protect against here.
      */}
      <HandoffControl
        label="Ask for a human"
        onSubmit={async (reason) => {
          const result = await api.post<{ ok: true }>(
            `/api/share/${encodeURIComponent(token)}/escalate`,
            {
              ...(reason ? { reason } : {}),
              // Visitor turns are never stored server-side, so the transcript
              // has to travel with the request. Only the turns that led here.
              transcript: turns.slice(-6).map((turn) => ({
                role: turn.role,
                content: turn.content,
              })),
            },
          );
          if (!result.ok) {
            toast.error(result.error.message);
            return false;
          }
          toast.success("Sent. Whoever built this agent now has a record of it.");
          return true;
        }}
      />

      {!closed && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send(draft);
          }}
          className="flex items-end gap-2 border-t border-line p-3"
        >
          <label htmlFor="share-chat-input" className="sr-only">
            Message {agentName}
          </label>
          <TextArea
            id="share-chat-input"
            rows={1}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send(draft);
              }
            }}
            placeholder={`Message ${agentName}…`}
            disabled={pending}
            maxLength={2000}
            className="min-h-11 resize-none font-sans"
          />
          {/* `shrink-0` keeps this at its full 44px on narrow screens — this
              column is tighter than the owner's, and flex would otherwise
              compress it below the touch-target minimum. */}
          <Button
            type="submit"
            size="icon"
            disabled={!draft.trim()}
            loading={pending}
            className="shrink-0"
          >
            <CornerDownLeft className="size-4" aria-hidden />
            <span className="sr-only">Send</span>
          </Button>
        </form>
      )}
    </Panel>
  );
}
