import "server-only";
import { z } from "zod";

/**
 * Server-only environment access.
 *
 * The `server-only` import at the top is load-bearing: if any client component
 * ever imports this module (directly or transitively), the build fails loudly
 * instead of quietly shipping `LYZR_API_KEY` to the browser.
 *
 * Nothing here is prefixed NEXT_PUBLIC_, so nothing here can reach a bundle.
 */

/**
 * An optional secret, where **blank means absent**.
 *
 * This distinction is load-bearing rather than pedantic. `.env.example` ships
 * every key written as `KEY=`, and a host's environment UI produces the same
 * thing when someone creates a variable and leaves the value empty. Without this
 * preprocess, `z.string().min(1).optional()` sees a present-but-empty string,
 * fails, and the app refuses to boot — turning the one case we promised would
 * degrade gracefully into the one case that takes the whole deployment down.
 */
function optionalSecret(min: number) {
  return z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().min(min).optional(),
  );
}

const schema = z.object({
  LYZR_API_KEY: optionalSecret(1),
  LYZR_BASE_URL: z.string().url().default("https://agent-prod.studio.lyzr.ai/v3"),
  /** Lyzr's `provider_id` — the vendor. Lowercase; see GET /v3/providers/type. */
  LYZR_PROVIDER_ID: z.string().min(1).default("openai"),
  /** The model the platform's own Mentor agent runs on. */
  LYZR_MENTOR_MODEL: z.string().min(1).default("gpt-4o-mini"),
  /** Web search, for campaigns that declare `retrieval`. See src/server/search.ts. */
  TAVILY_API_KEY: optionalSecret(1),
  TAVILY_BASE_URL: z.string().url().default("https://api.tavily.com"),
  AUTH_SECRET: optionalSecret(16),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // Malformed (as opposed to absent) config is a startup-time bug, not a
  // runtime condition to degrade around.
  const detail = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  throw new Error(`Invalid environment configuration — ${detail}`);
}

export const env = parsed.data;

/**
 * Absent credentials are handled differently from malformed ones: the app still
 * boots and every screen still works, but agent-backed surfaces show an honest
 * "not configured" state instead of a blank screen or a confusing 500.
 */
export const isLyzrConfigured = Boolean(env.LYZR_API_KEY);

/**
 * Search degrades one step further than Lyzr does: without a key, a campaign
 * that declares `retrieval` still answers, it just answers without sources and
 * says so on the turn. Nothing 500s and no screen disappears — the agent is
 * simply honest about having looked nothing up. See src/server/grounding.ts.
 */
export const isSearchConfigured = Boolean(env.TAVILY_API_KEY);

/**
 * Dev convenience only. In production an unset AUTH_SECRET is fatal, because a
 * predictable signing key means forgeable sessions.
 */
export function authSecret(): Uint8Array {
  const secret = env.AUTH_SECRET;

  if (!secret) {
    if (env.NODE_ENV === "production") {
      throw new Error(
        "AUTH_SECRET is required in production. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
      );
    }
    return new TextEncoder().encode("dev-only-insecure-secret-do-not-ship-32b");
  }

  return new TextEncoder().encode(secret);
}
