"use client";

import * as React from "react";
import { ExternalLink, Globe, SearchX } from "lucide-react";
import type { SearchSource } from "@/server/search";
import type { GroundingStatus } from "@/server/grounding";
import { cn } from "@/lib/cn";

/**
 * Citations, and the honest note that replaces them when there aren't any.
 *
 * Shared by the builder's own chat and the public share page so the two can't
 * drift — a source list that renders differently for a visitor than for the
 * person who built the agent would be a very easy way to end up showing someone
 * a claim that isn't backed the same way.
 *
 * The design rule here is that nothing is displayed unless it came back from the
 * provider. No "today" fallback for a missing date, no favicon fetched from a
 * third party, no summary written by us. If a field is absent it is simply not
 * rendered.
 */

/* ── Sources ───────────────────────────────────────────────────────────────── */

export function Citations({ sources }: { sources: SearchSource[] }) {
  if (sources.length === 0) return null;

  return (
    <div className="mt-3 border-t border-line pt-2.5">
      <p className="flex items-center gap-1.5 label-caps text-[10px] text-ink-mute">
        <Globe className="size-3" aria-hidden />
        {sources.length} {sources.length === 1 ? "source" : "sources"}
      </p>

      <ol className="mt-2 flex flex-col gap-2">
        {sources.map((source, index) => (
          <li key={`${source.url}-${index}`} className="flex gap-2">
            <span
              aria-hidden
              className="shrink-0 pt-px font-mono text-[10.5px] leading-relaxed text-ink-mute tnum"
            >
              [{index + 1}]
            </span>
            <span className="min-w-0 flex-1">
              <a
                href={source.url}
                target="_blank"
                // `noopener` is the security-relevant half (the new tab must not
                // get a handle on this window); `nofollow` because these are
                // arbitrary search results, not endorsements.
                rel="noopener noreferrer nofollow"
                className={cn(
                  "group inline-flex items-baseline gap-1 text-[12px] leading-snug text-ink-dim",
                  "underline decoration-line underline-offset-2 transition-colors duration-200",
                  "hover:text-accent-text hover:decoration-accent-line",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-bright",
                )}
              >
                <span className="line-clamp-2">{source.title}</span>
                <ExternalLink className="size-2.5 shrink-0 self-center opacity-60" aria-hidden />
              </a>
              <span className="mt-0.5 block truncate font-mono text-[10.5px] text-ink-mute">
                {hostnameOf(source.url)}
                {formatPublished(source.publishedDate) && (
                  <> · {formatPublished(source.publishedDate)}</>
                )}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ── The "no sources" note ─────────────────────────────────────────────────── */

/**
 * Shown under a reply from a grounded agent that has no citations.
 *
 * This exists because silence is the dangerous option. If a search fails and we
 * render nothing, the reply looks exactly like a sourced one and the reader has
 * no way to tell the difference — which is precisely the failure this whole
 * feature was built to remove. The agent has also been told, on that same turn,
 * to say it couldn't look anything up; this is the interface half of the same
 * promise.
 */
export function GroundingNote({ status }: { status: GroundingStatus | undefined }) {
  if (!status || status === "off" || status === "grounded") return null;

  const note = NOTES[status];
  if (!note) return null;

  return (
    <p className="mt-3 flex items-start gap-1.5 border-t border-line pt-2.5 text-[11px] leading-relaxed text-ink-mute">
      <SearchX className="mt-px size-3 shrink-0" aria-hidden />
      <span>{note}</span>
    </p>
  );
}

const NOTES: Partial<Record<GroundingStatus, string>> = {
  no_results: "No web sources came back for this question — this answer isn't sourced.",
  not_configured: "Web search isn't configured here, so nothing was looked up for this answer.",
  unavailable: "The search step couldn't run this turn, so nothing was looked up for this answer.",
};

/* ── Staged progress ───────────────────────────────────────────────────────── */

/**
 * The waiting state for a grounded turn.
 *
 * Two stages, and both are true when shown: the search really is the first thing
 * that happens, and the model really does read the results afterwards. The
 * hand-off point is a timer rather than a real progress event — there is one
 * round trip, not a stream — so the wording stays deliberately unquantified.
 * "Reading 5 sources" would be a number we hadn't yet earned.
 */
export function GroundedThinking() {
  const [stage, setStage] = React.useState<0 | 1>(0);

  React.useEffect(() => {
    // Measured: a basic search lands in ~1.3–2.7s, so this is roughly when the
    // reading actually starts.
    const timer = setTimeout(() => setStage(1), 1_800);
    return () => clearTimeout(timer);
  }, []);

  return (
    <span className="flex items-center gap-2 text-[12px] text-ink-mute" aria-live="polite">
      <Globe className="size-3.5 shrink-0 animate-pulse" aria-hidden />
      {stage === 0 ? "Searching the web…" : "Reading the sources…"}
    </span>
  );
}

/* ── Formatting ────────────────────────────────────────────────────────────── */

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/**
 * Formats a provider publication date, or returns null.
 *
 * Deliberately built from UTC parts rather than `toLocaleDateString`: these
 * arrive as GMT strings, and rendering them in the viewer's timezone can move a
 * late-evening story to the next day — a citation whose date disagrees with the
 * page it links to reads as fabricated even when it isn't. An unparseable value
 * renders as nothing at all.
 */
function formatPublished(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}
