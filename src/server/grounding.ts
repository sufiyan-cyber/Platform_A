import "server-only";
import type { Campaign } from "@/campaigns/types";
import { searchWeb, type SearchSource } from "@/server/search";
import { consume } from "@/server/rate-limit";
import { AppError } from "@/lib/api-error";

/**
 * Grounding: turning one user message into the message we actually send, plus
 * the sources the reader gets to check.
 *
 * This module owns the honesty guarantee for retrieval. The rule it enforces is
 * narrow and absolute: **the agent may only cite what is in the block below it.**
 * Every path that produces no sources — no key, a dead provider, a query that
 * returned nothing — still prepends a block, and that block tells the agent it
 * looked nothing up and must say so. There is deliberately no code path where
 * the agent is left to guess whether it has sources, because the failure mode
 * of guessing is an invented URL under a real-looking citation number.
 *
 * Nothing here branches on a campaign id. A campaign is grounded because its
 * data says `retrieval`, which is what lets another campaign opt in without a
 * line of route logic changing. See src/campaigns/types.ts.
 */

export type GroundingStatus =
  /** Campaign declares no retrieval — the message went through untouched. */
  | "off"
  /** Sources were retrieved and injected. */
  | "grounded"
  /** Search ran and honestly found nothing. */
  | "no_results"
  /** No TAVILY_API_KEY on this deployment. */
  | "not_configured"
  /** Search was configured but failed, timed out, or was rate limited. */
  | "unavailable";

export type Grounding = {
  /** What to send upstream — the original message, or it wrapped in a sources block. */
  message: string;
  /** What the reader sees under the reply. Empty unless `status` is "grounded". */
  sources: SearchSource[];
  status: GroundingStatus;
};

/** True when this campaign's agent searches before it answers. */
export function isGrounded(campaign: Campaign): boolean {
  return campaign.retrieval?.kind === "web";
}

/**
 * Searches (when the campaign asks for it) and composes the turn.
 *
 * Never throws. A campaign that wants grounding gets the best available answer:
 * sources if we can get them, an explicit "you have none" instruction if we
 * can't. Failing the whole turn because a search provider had a bad minute would
 * trade a slightly weaker answer for no answer at all.
 */
export async function groundMessage(params: {
  campaign: Campaign;
  message: string;
  /** Rate-limit key — the user id for owner chat, the visitor IP for share chat. */
  identity: string;
}): Promise<Grounding> {
  const retrieval = params.campaign.retrieval;
  if (retrieval?.kind !== "web") {
    return { message: params.message, sources: [], status: "off" };
  }

  const { sources, failure } = await runSearch({
    query: params.message,
    maxSources: retrieval.maxSources,
    identity: params.identity,
  });

  if (sources.length > 0) {
    return {
      message: composeGrounded(sources, params.message),
      sources,
      status: "grounded",
    };
  }

  return {
    message: composeUngrounded(params.message),
    sources: [],
    // No failure and no sources means the search genuinely came back empty.
    status: failure ?? "no_results",
  };
}

async function runSearch(params: {
  query: string;
  maxSources: number;
  identity: string;
}): Promise<{
  sources: SearchSource[];
  /** Why the search produced nothing, or null if it simply found nothing. */
  failure: "not_configured" | "unavailable" | null;
}> {
  // Consumed here rather than at the route so the limit covers every entry
  // point, and caught rather than thrown so a tripped bucket degrades the turn
  // instead of failing it — the user still gets an answer, labelled unsourced.
  try {
    consume("search", params.identity);
  } catch {
    console.warn("[grounding] search rate limit tripped — answering without sources");
    return { sources: [], failure: "unavailable" };
  }

  try {
    const sources = await searchWeb({ query: params.query, maxSources: params.maxSources });
    return { sources, failure: null };
  } catch (error) {
    if (error instanceof AppError && error.code === "not_configured") {
      return { sources: [], failure: "not_configured" };
    }
    console.warn("[grounding] search failed — answering without sources:", error);
    return { sources: [], failure: "unavailable" };
  }
}

/* ── Prompt composition ────────────────────────────────────────────────────── */

/**
 * The grounded block.
 *
 * Numbered so the agent has something concrete to cite, and fenced with explicit
 * markers so it reads as retrieved material rather than as something the user
 * typed — the same technique the Mentor's CONTEXT block uses.
 */
function composeGrounded(sources: SearchSource[], message: string): string {
  const list = sources
    .map((source, index) => {
      const lines = [`[${index + 1}] ${source.title}`, `    ${source.url}`];
      if (source.publishedDate) lines.push(`    published: ${source.publishedDate}`);
      if (source.snippet) lines.push(`    ${source.snippet}`);
      return lines.join("\n");
    })
    .join("\n\n");

  return [
    "=== RETRIEVED WEB SOURCES (fetched by the system for this question — not typed by the person you are talking to) ===",
    list,
    "=== END RETRIEVED WEB SOURCES ===",
    "",
    "How to use these on this turn:",
    // This line is load-bearing, and was added after watching a real agent get
    // it wrong. Campaign instructions define "supplied material" as the text the
    // developer pasted in, so an agent handed sources it has no category for
    // hedges: the observed reply opened "I cannot provide a current summary
    // based on the sources you retrieved" and then delivered exactly that
    // summary, citing them. Naming the sources as supplied material resolves
    // which rule applies before the model has to guess.
    "- These count as supplied material for this turn. Treat them exactly as your instructions tell you to treat anything supplied to you.",
    "- Cite with the bracket numbers above, e.g. [2]. Only cite a source you actually used.",
    "- Never write a citation number, a URL, or a publication date that does not appear above.",
    "- If they answer only part of the question, answer that part and name what is still missing. Do not open by refusing and then answer anyway.",
    "- Do not fill a gap from memory and let it look sourced.",
    "- Do not list the sources again at the end. They are already shown to the reader.",
    "",
    "The person's message follows.",
    "---",
    message,
  ].join("\n");
}

/**
 * The ungrounded block — the one that matters most.
 *
 * A grounded agent that silently loses its search step is more dangerous than an
 * agent that never had one, because the person asking has been told it looks
 * things up. So the absence is stated to the model as a fact about this turn,
 * with the invented-citation failure named explicitly rather than left implied.
 */
function composeUngrounded(message: string): string {
  return [
    "=== RETRIEVED WEB SOURCES ===",
    "None. The search step returned nothing usable for this question.",
    "=== END RETRIEVED WEB SOURCES ===",
    "",
    "How to answer this turn:",
    "- You have no retrieved sources. Answer only from your supplied material and this conversation.",
    "- Say plainly, in your own words, that you could not look anything up for this one.",
    "- Do not invent a citation number, a URL, a publication date, or a source title. There is nothing to cite.",
    "",
    "The person's message follows.",
    "---",
    message,
  ].join("\n");
}
