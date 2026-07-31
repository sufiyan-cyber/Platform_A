import "server-only";
import { env, isSearchConfigured } from "@/server/env";
import { AppError } from "@/lib/api-error";

/**
 * The web search execution layer — the only module that knows TAVILY_API_KEY
 * exists, exactly as `lyzr.ts` is the only module that knows about the Lyzr key.
 *
 * This file is transport only: one query in, a list of sources out. Deciding
 * *whether* to search, what to tell the model about the results, and what the
 * agent may claim when there are none, all live in `grounding.ts` — the same
 * split as `lyzr.ts` (transport) and `mentor.ts` (composition).
 *
 * Network assumptions match lyzr.ts: bounded timeout, retries on transient
 * failures only, jittered backoff, and defensive parsing of a response shape
 * that is allowed to change under us.
 */

const SEARCH_TIMEOUT_MS = 12_000;
/**
 * One retry, not two. A grounded turn pays this latency *before* the agent call
 * even starts, and a caller that has already waited two failed attempts is
 * better served by an honest ungrounded answer than by a third try.
 */
const MAX_ATTEMPTS = 2;

/** Per-source context budget. Five of these is ~6k chars, which is affordable. */
const SNIPPET_MAX_CHARS = 1_200;

export type SearchSource = {
  title: string;
  url: string;
  /** Provider-extracted page text, truncated. Not the raw HTML. */
  snippet: string;
  /**
   * RFC-1123 date string as the provider returned it, or null.
   *
   * Null is common and correct: Tavily only dates results when it routes a query
   * to its news index, and an evergreen query legitimately comes back undated.
   * This is never inferred, never defaulted to "today", and the UI omits the
   * date rather than showing a guess — a fabricated publication date is exactly
   * the kind of detail that reads as authoritative and is impossible to spot.
   */
  publishedDate: string | null;
};

/**
 * Runs one search.
 *
 * `auto_parameters` lets the provider route the query itself: a time-sensitive
 * question goes to the news index (and comes back with real publication dates),
 * an evergreen one stays on general web search. Verified against the live API —
 * "what did X announce this week" returns five dated results, "tradeoffs between
 * A and B" returns five undated ones, which is the correct behaviour for both.
 *
 * `search_depth` is pinned to "basic" on purpose. Left to auto, the provider
 * upgrades evergreen queries to "advanced", which measured 7.3s against 1.3s —
 * latency the caller pays before the agent has even been asked.
 */
export async function searchWeb(params: {
  query: string;
  maxSources: number;
}): Promise<SearchSource[]> {
  if (!isSearchConfigured) {
    throw new AppError("not_configured", "Web search isn't configured on this deployment.", {
      retryable: false,
    });
  }

  const raw = await post({
    path: "/search",
    body: {
      query: params.query,
      max_results: clampSources(params.maxSources),
      auto_parameters: true,
      search_depth: "basic",
      include_answer: false,
      include_images: false,
      include_raw_content: false,
    },
    timeoutMs: SEARCH_TIMEOUT_MS,
    label: "search",
  });

  return extractSources(raw, clampSources(params.maxSources));
}

function clampSources(value: number): number {
  if (!Number.isFinite(value)) return 5;
  return Math.min(10, Math.max(1, Math.trunc(value)));
}

/* ── Core request ──────────────────────────────────────────────────────────── */

type RequestOptions = {
  path: string;
  body: unknown;
  timeoutMs: number;
  /** Log lines only; never surfaced to the client. */
  label: string;
};

async function post({ path, body, timeoutMs, label }: RequestOptions): Promise<unknown> {
  const url = `${env.TAVILY_BASE_URL.replace(/\/+$/, "")}${path}`;
  let lastTransientError: AppError | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.TAVILY_API_KEY!}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });

      if (response.ok) return await readJson(response);

      const detail = await readErrorDetail(response);

      // 4xx other than 429 is our bug or a dead key — retrying cannot help.
      if (response.status !== 429 && response.status < 500) {
        console.error(`[search] ${label} failed ${response.status}: ${detail}`);
        throw new AppError(
          response.status === 401 || response.status === 403
            ? "not_configured"
            : "agent_service_error",
          response.status === 401 || response.status === 403
            ? "The search service rejected our credentials. Check TAVILY_API_KEY."
            : "The search service rejected that query.",
          { retryable: false },
        );
      }

      lastTransientError = new AppError(
        response.status === 429 ? "rate_limited" : "agent_service_unavailable",
        response.status === 429
          ? "The search service is rate limiting us."
          : "The search service is unavailable.",
      );
      console.warn(`[search] ${label} attempt ${attempt}/${MAX_ATTEMPTS} → ${response.status}`);
    } catch (error) {
      if (error instanceof AppError) {
        if (!error.retryable) throw error;
        lastTransientError = error;
      } else if (isTimeout(error)) {
        lastTransientError = new AppError(
          "agent_service_timeout",
          "The search service took too long to answer.",
        );
        console.warn(`[search] ${label} attempt ${attempt}/${MAX_ATTEMPTS} timed out`);
      } else {
        lastTransientError = new AppError(
          "agent_service_unavailable",
          "We couldn't reach the search service.",
        );
        console.warn(`[search] ${label} attempt ${attempt}/${MAX_ATTEMPTS} network error:`, error);
      }
    }

    if (attempt < MAX_ATTEMPTS) await sleep(backoffMs(attempt));
  }

  throw lastTransientError ?? new AppError("agent_service_unavailable");
}

function backoffMs(attempt: number): number {
  return 400 * 2 ** (attempt - 1) + Math.random() * 250;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isTimeout(error: unknown): boolean {
  return (
    error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    // Unlike a chat reply, a non-JSON search body has nothing salvageable in it.
    return {};
  }
}

async function readErrorDetail(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return "<unreadable body>";
  }
}

/* ── Tolerant response parsing (exported for tests) ────────────────────────── */

/**
 * Pulls sources out of a search response.
 *
 * Every field is checked rather than trusted: a result without a usable http(s)
 * URL is dropped entirely, because a citation the reader cannot click is worse
 * than one less citation. A shape change upstream therefore degrades to fewer
 * sources — or to none, which `grounding.ts` already handles honestly — instead
 * of putting `undefined` in front of a judge.
 */
export function extractSources(raw: unknown, maxSources: number): SearchSource[] {
  const results = (raw as { results?: unknown })?.results;
  if (!Array.isArray(results)) {
    console.error("[search] response had no results array:", JSON.stringify(raw).slice(0, 400));
    return [];
  }

  const sources: SearchSource[] = [];

  for (const entry of results) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;

    const url = typeof record.url === "string" ? record.url.trim() : "";
    if (!isHttpUrl(url)) continue;

    const snippet = typeof record.content === "string" ? record.content.trim() : "";
    const title = typeof record.title === "string" ? record.title.trim() : "";

    sources.push({
      // Falling back to the hostname keeps the list readable when a page has no
      // usable <title>, without inventing a description of it.
      title: title || hostnameOf(url),
      url,
      snippet: truncate(snippet, SNIPPET_MAX_CHARS),
      publishedDate:
        typeof record.published_date === "string" && record.published_date.trim()
          ? record.published_date.trim()
          : null,
    });

    if (sources.length >= maxSources) break;
  }

  return sources;
}

/** http/https only — `javascript:` and friends must never reach an href. */
function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function hostnameOf(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

function truncate(value: string, max: number): string {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}
