import "server-only";
import { env, isLyzrConfigured } from "@/server/env";
import { AppError } from "@/lib/api-error";

/**
 * The Lyzr execution layer — the *only* module in the codebase that knows the
 * API key exists.
 *
 * `server-only` + the fact that nothing outside `src/server/**` imports this
 * means the key cannot reach a client bundle. Every browser-facing call goes
 * through `/api/lyzr/*`-style route handlers which call in here.
 *
 * Everything below assumes the network is hostile: bounded timeouts, bounded
 * retries with jittered backoff on transient failures only, and defensive
 * parsing of a response shape the docs don't fully pin down.
 */

const CREATE_TIMEOUT_MS = 30_000;
const CHAT_TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 3;

/**
 * The wire shape of a create-agent request, verified against the live API's
 * OpenAPI spec rather than the quickstart page (which documents `POST /v3/agent`
 * with `role`/`goal`/`instructions`/`provider` — none of which exist; that path
 * returns 405 and the field names are all prefixed).
 *
 * `temperature` and `top_p` are genuinely required by the schema.
 */
export type CreateAgentInput = {
  name: string;
  /** The vendor, e.g. "openai" — lowercase, from GET /v3/providers/type?provider_type=llm */
  provider_id: string;
  /** The model within that vendor, e.g. "gpt-4o-mini". */
  model: string;
  agent_role: string;
  agent_goal: string;
  agent_instructions: string;
  temperature: number;
  top_p: number;
  /**
   * Agent capabilities. Empty is the schema default and quietly produces an
   * agent with no conversational memory — see SHORT_TERM_MEMORY in
   * src/lib/assemble.ts. Type strings are case-sensitive and only validated at
   * inference time, so a typo here fails silently at create.
   */
  features: { type: string; config: Record<string, unknown>; priority: number }[];
  tools: unknown[];
};

export type CreateAgentResult = { agentId: string; raw: unknown };
export type ChatResult = { reply: string; raw: unknown };

/* ── Core request ──────────────────────────────────────────────────────────── */

type RequestOptions = {
  path: string;
  body: unknown;
  timeoutMs: number;
  /** Used only in log lines; never surfaced to the client. */
  label: string;
};

async function post({ path, body, timeoutMs, label }: RequestOptions): Promise<unknown> {
  if (!isLyzrConfigured) {
    throw new AppError("not_configured");
  }

  const url = `${env.LYZR_BASE_URL.replace(/\/+$/, "")}${path}`;
  let lastTransientError: AppError | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "x-api-key": env.LYZR_API_KEY!,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });

      if (response.ok) {
        return await readJson(response);
      }

      const detail = await readErrorDetail(response);

      // 4xx (other than 429) is our bug or bad input — retrying can't help.
      if (response.status !== 429 && response.status < 500) {
        console.error(`[lyzr] ${label} failed ${response.status}: ${detail}`);
        throw new AppError(
          "agent_service_error",
          response.status === 401 || response.status === 403
            ? "The agent service rejected our credentials. Check LYZR_API_KEY."
            : "The agent service rejected that configuration. Adjust a decision and try again.",
          { retryable: false },
        );
      }

      lastTransientError = new AppError(
        response.status === 429 ? "rate_limited" : "agent_service_unavailable",
      );
      console.warn(`[lyzr] ${label} attempt ${attempt}/${MAX_ATTEMPTS} → ${response.status}`);
    } catch (error) {
      if (error instanceof AppError) {
        if (!error.retryable) throw error;
        lastTransientError = error;
      } else if (isTimeout(error)) {
        lastTransientError = new AppError("agent_service_timeout");
        console.warn(`[lyzr] ${label} attempt ${attempt}/${MAX_ATTEMPTS} timed out`);
      } else {
        lastTransientError = new AppError(
          "agent_service_unavailable",
          "We couldn't reach the agent service. Check your connection and try again.",
        );
        console.warn(`[lyzr] ${label} attempt ${attempt}/${MAX_ATTEMPTS} network error:`, error);
      }
    }

    if (attempt < MAX_ATTEMPTS) {
      await sleep(backoffMs(attempt));
    }
  }

  throw lastTransientError ?? new AppError("agent_service_unavailable");
}

/** Exponential backoff with jitter, so retries from many clients don't align. */
function backoffMs(attempt: number): number {
  const base = 400 * 2 ** (attempt - 1);
  return base + Math.random() * 250;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isTimeout(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    // A 200 that isn't JSON still carries the answer often enough to keep.
    return { raw_text: text };
  }
}

async function readErrorDetail(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, 500);
  } catch {
    return "<unreadable body>";
  }
}

/* ── Public operations ─────────────────────────────────────────────────────── */

/**
 * Creates a real agent. Returns the id we then store on the build.
 *
 * The docs don't publish the exact response envelope, so the id is extracted
 * tolerantly — a shape change on their side degrades to a clear error rather
 * than a silent `undefined` written into the database.
 */
export async function createAgent(input: CreateAgentInput): Promise<CreateAgentResult> {
  const raw = await post({
    // Plural, with the trailing slash. `/v3/agent` exists but rejects POST (405),
    // and FastAPI will not redirect a POST across the missing slash.
    path: "/agents/",
    body: input,
    timeoutMs: CREATE_TIMEOUT_MS,
    label: "create-agent",
  });

  const agentId = extractAgentId(raw);
  if (!agentId) {
    console.error("[lyzr] create-agent returned no usable id:", JSON.stringify(raw).slice(0, 800));
    throw new AppError(
      "agent_service_error",
      "The agent service accepted the config but didn't return an agent id. Nothing was lost — try launching again.",
      { retryable: true },
    );
  }

  return { agentId, raw };
}

/**
 * One conversational turn.
 *
 * The agent id travels in the body here, not the path — the per-agent chat route
 * from the quickstart doesn't exist. `user_id` is what Lyzr attributes the
 * conversation to, and `session_id` is what makes it multi-turn.
 */
export async function chatWithAgent(params: {
  agentId: string;
  message: string;
  sessionId: string;
  userId: string;
}): Promise<ChatResult> {
  const raw = await post({
    path: "/inference/chat/",
    body: {
      user_id: params.userId,
      agent_id: params.agentId,
      session_id: params.sessionId,
      message: params.message,
    },
    timeoutMs: CHAT_TIMEOUT_MS,
    label: "chat",
  });

  const reply = extractReply(raw);
  if (!reply) {
    console.error("[lyzr] chat returned no usable text:", JSON.stringify(raw).slice(0, 800));
    throw new AppError(
      "agent_service_error",
      "The agent replied with something we couldn't read. Try rephrasing your message.",
      { retryable: true },
    );
  }

  return { reply, raw };
}

/* ── Tolerant response parsing (exported for tests) ────────────────────────── */

const ID_KEYS = ["agent_id", "agentId", "_id", "id"] as const;
const REPLY_KEYS = ["response", "message", "answer", "output", "text", "content", "raw_text"] as const;

export function extractAgentId(raw: unknown): string | null {
  const found = pluck(raw, ID_KEYS as readonly string[], 3);
  return typeof found === "string" && found.trim() ? found.trim() : null;
}

export function extractReply(raw: unknown): string | null {
  if (typeof raw === "string" && raw.trim()) return raw.trim();

  const found = pluck(raw, REPLY_KEYS as readonly string[], 3);
  if (typeof found === "string" && found.trim()) return found.trim();

  // Some providers nest the text one more level, e.g. { response: { content } }.
  if (found && typeof found === "object") {
    const nested = pluck(found, REPLY_KEYS as readonly string[], 2);
    if (typeof nested === "string" && nested.trim()) return nested.trim();
  }

  return null;
}

/**
 * Breadth-first search for the first of `keys` present in a nested object.
 * Bounded depth so a pathological payload can't cost us a stack.
 */
function pluck(value: unknown, keys: readonly string[], maxDepth: number): unknown {
  if (maxDepth < 0 || value === null || typeof value !== "object") return undefined;

  const record = value as Record<string, unknown>;
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }

  for (const nested of Object.values(record)) {
    if (nested && typeof nested === "object") {
      const found = pluck(nested, keys, maxDepth - 1);
      if (found !== undefined) return found;
    }
  }

  return undefined;
}
