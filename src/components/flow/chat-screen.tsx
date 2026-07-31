"use client";

import * as React from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  CornerDownLeft,
  Pencil,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { useBuildStore } from "@/store/build-provider";
import { mergeMessages } from "@/store/build-store";
import { api } from "@/lib/client-api";
import type { ApiError } from "@/lib/api-error";
import type { StoredMessage } from "@/server/builds";
import { previewPayload } from "@/lib/assemble";
import { SharePanel } from "@/components/flow/share-panel";
import { EscalationsPanel } from "@/components/flow/escalations-panel";
import { Citations, GroundedThinking, GroundingNote } from "@/components/chat/citations";
import { HandoffControl } from "@/components/chat/handoff";
import type { EscalationRecord } from "@/server/escalations";
import { Button } from "@/components/ui/button";
import { Chip, Panel, PanelTitle } from "@/components/ui/panel";
import { TextArea, TextInput } from "@/components/ui/field";
import { ErrorBlock, LoadingBlock } from "@/components/ui/states";
import { cn } from "@/lib/cn";

/**
 * The finale: a live conversation with the agent the developer just built.
 *
 * The transcript is server-persisted, so refreshing mid-conversation keeps it —
 * and the config that produced this agent sits beside the chat, because the
 * whole point is being able to connect a behaviour you're seeing back to the
 * decision that caused it.
 */
export function ChatScreen() {
  const build = useBuildStore((s) => s.build);
  const campaign = useBuildStore((s) => s.campaign);
  const payload = useBuildStore((s) => s.launch.payload);
  const goToStage = useBuildStore((s) => s.goToStage);
  const doLaunch = useBuildStore((s) => s.doLaunch);
  const launching = useBuildStore((s) => s.launch.pending);

  const agent = build.agent;

  // Handoffs live here rather than in `Conversation` because the control that
  // creates them and the panel that shows them are siblings — and the whole
  // demo beat is the record appearing the moment the button is pressed, which
  // means one owner of that list, not two copies drifting apart.
  const [escalations, setEscalations] = React.useState<EscalationRecord[] | null>(null);

  React.useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      const result = await api.get<{ escalations: EscalationRecord[] }>(
        `/api/builds/${build.id}/escalations`,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      // A failure here leaves the panel in its loading state rather than
      // shouting: the conversation is the primary surface, and a handoff list
      // that couldn't load is not worth an error block over the top of it.
      if (result.ok) setEscalations(result.data.escalations);
    })();

    return () => controller.abort();
  }, [build.id]);

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-5">
        <LaunchBanner />
        <Conversation
          buildId={build.id}
          agentName={agent?.name ?? campaign.name}
          grounded={campaign.retrieval?.kind === "web"}
          onEscalated={(record) =>
            setEscalations((current) => [record, ...(current ?? [])])
          }
        />
      </div>

      {/*
        `min-w-0` is load-bearing. A grid item defaults to `min-width: auto`,
        which means it cannot shrink below its content's min-content width — and
        the config preview below is a `<pre>` with `white-space: pre` whose
        longest line is the whole `agent_instructions` string (5k+ chars). Without
        this, on mobile the implicit column resolves to ~37,000px, `overflow-auto`
        never engages, and the entire page scrolls sideways. The left column
        already carries it; this one was missed because at `lg` the track is a
        fixed 320px and the bug is invisible.
      */}
      <div className="flex min-w-0 flex-col gap-5 lg:sticky lg:top-6">
        <AgentCard />

        <EscalationsPanel records={escalations} />

        <SharePanel />

        {payload && (
          <Panel className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5">
              <PanelTitle>The config you wrote</PanelTitle>
            </div>
            <pre className="max-h-80 overflow-auto p-4 font-mono text-[11px] leading-relaxed text-ink-mute">
              {previewPayload(payload)}
            </pre>
          </Panel>
        )}

        <Panel inset className="p-4">
          <PanelTitle>What now</PanelTitle>
          <div className="mt-3 flex flex-col gap-2">
            <Button
              variant="subtle"
              size="sm"
              onClick={() => goToStage("mission", campaign.missions[0]?.id)}
              className="justify-start"
            >
              <Pencil className="size-3.5" aria-hidden />
              Tweak a decision
            </Button>
            <Button
              variant="subtle"
              size="sm"
              onClick={() => void doLaunch({ rebuild: true })}
              loading={launching}
              className="justify-start"
            >
              <RefreshCw className="size-3.5" aria-hidden />
              Rebuild as a new agent
            </Button>
            <Button asChild variant="ghost" size="sm" className="justify-start">
              <Link href="/campaigns">
                <ArrowLeft className="size-3.5" aria-hidden />
                Try another campaign
              </Link>
            </Button>
          </div>
          <p className="mt-3 border-t border-line pt-3 text-[11.5px] leading-relaxed text-ink-mute">
            Rebuilding creates a fresh agent from your current decisions. The old one stays in your
            Lyzr workspace.
          </p>
        </Panel>
      </div>
    </div>
  );
}

/* ── Banner ────────────────────────────────────────────────────────────────── */

function LaunchBanner() {
  const build = useBuildStore((s) => s.build);
  const xp = useBuildStore((s) => s.build.xp);
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 240, damping: 22 }}
    >
      <Panel className="relative overflow-hidden p-5 sm:p-6">
        <div aria-hidden className="pointer-events-none absolute inset-0 aurora opacity-70" />
        <div className="relative flex flex-wrap items-center gap-4">
          <div className="grid size-11 shrink-0 place-items-center rounded-(--radius-card) border border-live-line bg-live-soft">
            <Check className="size-5 text-live" strokeWidth={2.5} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[20px] leading-tight font-semibold sm:text-[23px]">
              {build.agent?.name ?? "Your agent"} is live.
            </h1>
            <p className="mt-1 text-[13px] text-ink-dim">
              You built it decision by decision. Now talk to it.
            </p>
          </div>
          <Chip tone="accent">
            <Sparkles className="size-3" aria-hidden />
            {xp} XP earned
          </Chip>
        </div>
      </Panel>
    </motion.div>
  );
}

/* ── Agent card ────────────────────────────────────────────────────────────── */

function AgentCard() {
  const build = useBuildStore((s) => s.build);
  const rename = useBuildStore((s) => s.renameAgent);

  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(build.agent?.name ?? "");
  const [saving, setSaving] = React.useState(false);

  async function save() {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      toast.error("Give it at least two characters.");
      return;
    }
    setSaving(true);
    const ok = await rename(trimmed);
    setSaving(false);
    if (ok) {
      setEditing(false);
      toast.success("Renamed.");
    }
  }

  if (!build.agent) return null;

  return (
    <Panel className="p-4">
      <div className="flex items-center justify-between gap-2">
        <PanelTitle>Your agent</PanelTitle>
        <span className="inline-flex items-center gap-1.5 font-mono text-[10.5px] text-live">
          <span aria-hidden className="size-1.5 rounded-full bg-live animate-pulse-live" />
          live
        </span>
      </div>

      {editing ? (
        <div className="mt-3 flex flex-col gap-2">
          <label htmlFor="agent-name" className="sr-only">
            Agent name
          </label>
          <TextInput
            id="agent-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void save();
              if (event.key === "Escape") setEditing(false);
            }}
            autoFocus
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void save()} loading={saving}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={cn(
            "mt-3 flex w-full cursor-pointer items-center justify-between gap-2 rounded-(--radius-control)",
            "border border-line bg-surface-2 px-3 py-2.5 text-left",
            "transition-colors duration-200 hover:border-accent-line",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-bright",
          )}
        >
          <span className="truncate font-display text-[14px] font-semibold">
            {build.agent.name}
          </span>
          <Pencil className="size-3.5 shrink-0 text-ink-mute" aria-hidden />
          <span className="sr-only">Rename agent</span>
        </button>
      )}

      <dl className="mt-3 flex flex-col gap-2 border-t border-line pt-3 text-[11.5px]">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-ink-mute">Agent id</dt>
          <dd className="truncate font-mono text-ink-dim" title={build.agent.id}>
            {build.agent.id.length > 16
              ? `${build.agent.id.slice(0, 8)}…${build.agent.id.slice(-6)}`
              : build.agent.id}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-ink-mute">Launched</dt>
          <dd className="font-mono text-ink-dim tnum">
            {new Date(build.agent.launchedAt).toLocaleString()}
          </dd>
        </div>
      </dl>
    </Panel>
  );
}

/* ── Conversation ──────────────────────────────────────────────────────────── */

/**
 * Opening prompts, chosen by what the campaign can actually do rather than by
 * its id. A grounded agent gets asked something only a live search can answer,
 * because a first message the agent handles from training data alone teaches the
 * developer nothing about what they just built.
 */
const DEFAULT_PROMPTS = ["Hey, what can you help me with?", "I want a refund for last month."];
const GROUNDED_PROMPTS = [
  "What happened in AI this week?",
  "What do you actually know about my company?",
];

function Conversation({
  buildId,
  agentName,
  grounded,
  onEscalated,
}: {
  buildId: string;
  agentName: string;
  /** Campaign declares `retrieval` — drives the waiting state and the prompts. */
  grounded: boolean;
  onEscalated: (record: EscalationRecord) => void;
}) {
  const [messages, setMessages] = React.useState<StoredMessage[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<ApiError | null>(null);
  const [draft, setDraft] = React.useState("");
  const [lastAttempt, setLastAttempt] = React.useState<string | null>(null);

  const endRef = React.useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  // Load the persisted transcript. Aborted on unmount so a fast navigation
  // doesn't set state on a dead component.
  React.useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      const result = await api.get<{ messages: StoredMessage[] }>(
        `/api/builds/${buildId}/chat`,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      if (result.ok) {
        // Merge, don't replace: a message sent before this lands would
        // otherwise be silently dropped from the transcript.
        setMessages((current) => mergeMessages(result.data.messages, current));
      } else {
        setError(result.error);
      }
      setLoading(false);
    })();

    return () => controller.abort();
  }, [buildId]);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "end" });
  }, [messages.length, pending, reduceMotion]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending) return;

    setDraft("");
    setError(null);
    setLastAttempt(trimmed);
    setPending(true);

    // Echo immediately — it's the developer's own text, so there is nothing to
    // be wrong about, and waiting a full round trip to see it feels broken.
    const echo: StoredMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, echo]);

    const result = await api.post<{ user: StoredMessage; reply: StoredMessage }>(
      `/api/builds/${buildId}/chat`,
      { message: trimmed },
    );

    setPending(false);

    if (!result.ok) {
      // Roll the echo back so the failed turn isn't left looking delivered.
      setMessages((current) => current.filter((m) => m.id !== echo.id));
      setError(result.error);
      setDraft(trimmed);
      return;
    }

    setMessages((current) => [
      ...current.filter((m) => m.id !== echo.id),
      result.data.user,
      result.data.reply,
    ]);
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
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium">{agentName}</p>
          <p className="font-mono text-[10.5px] text-live">● running on Lyzr</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <LoadingBlock label="Loading your conversation…" />
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 py-10 text-center">
            <div className="grid size-11 place-items-center rounded-(--radius-card) border border-accent-line bg-accent-soft">
              <Sparkles className="size-5 text-accent-text" strokeWidth={1.75} aria-hidden />
            </div>
            <div>
              <p className="font-display text-[15px] font-semibold">Say something to it.</p>
              <p className="mx-auto mt-1.5 max-w-[44ch] text-[12.5px] leading-relaxed text-ink-dim">
                {grounded
                  ? "Ask it something that happened recently — it searches the web first, and every claim comes back with a link you can open."
                  : "Try the thing you told it to refuse — the fastest way to find out whether your rules actually hold."}
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
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {messages.map((message) => (
              <li
                key={message.id}
                className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-(--radius-card) border px-3.5 py-2.5",
                    "text-[13px] leading-relaxed",
                    message.role === "user"
                      ? "border-accent-line bg-accent-soft text-ink"
                      : "border-line bg-surface-2 text-ink-dim",
                  )}
                >
                  {/* `whitespace-pre-wrap` belongs to the text, not the bubble —
                      the citation list below is real markup and would inherit
                      the collapsed-newline behaviour otherwise. */}
                  <div className="whitespace-pre-wrap">{message.content}</div>
                  {message.role === "assistant" && (
                    <>
                      <Citations sources={message.sources ?? []} />
                      <GroundingNote status={message.grounding} />
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
            onRetry={
              error.retryable && lastAttempt ? () => void send(lastAttempt) : undefined
            }
            className="mt-4"
          />
        )}

        <div ref={endRef} />
      </div>

      <HandoffControl
        onSubmit={async (reason) => {
          const result = await api.post<{ escalation: EscalationRecord }>(
            `/api/builds/${buildId}/escalations`,
            reason ? { reason } : {},
          );
          if (!result.ok) {
            toast.error(result.error.message);
            return false;
          }
          onEscalated(result.data.escalation);
          toast.success("Handed off. The record is in the panel beside the chat.");
          return true;
        }}
      />

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send(draft);
        }}
        className="flex items-end gap-2 border-t border-line p-3"
      >
        <label htmlFor="chat-input" className="sr-only">
          Message {agentName}
        </label>
        <TextArea
          id="chat-input"
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
          className="min-h-11 resize-none font-sans"
        />
        <Button type="submit" size="icon" disabled={!draft.trim()} loading={pending}>
          <CornerDownLeft className="size-4" aria-hidden />
          <span className="sr-only">Send</span>
        </Button>
      </form>
    </Panel>
  );
}
