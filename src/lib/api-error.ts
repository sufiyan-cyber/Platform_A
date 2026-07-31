/**
 * One error shape for the whole API surface.
 *
 * Every route handler returns either `{ ok: true, data }` or `{ ok: false, error }`,
 * so the client never has to guess. `code` drives recovery UI; `message` is
 * written to be shown to a developer verbatim — no stack traces, no vendor
 * jargon leaking through.
 */

export const ERROR_CODES = [
  "unauthorized",
  "not_found",
  "invalid_input",
  "rate_limited",
  "agent_service_unavailable",
  "agent_service_timeout",
  "agent_service_error",
  "not_configured",
  "conflict",
  "internal",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export type ApiError = {
  code: ErrorCode;
  /** Safe to render directly in the UI. */
  message: string;
  /** Present when the failure is worth trying again. */
  retryable: boolean;
  /** Field-level detail for `invalid_input`. */
  fields?: Record<string, string>;
};

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

/** HTTP status to return for each code. */
export const STATUS_FOR_CODE: Record<ErrorCode, number> = {
  unauthorized: 401,
  not_found: 404,
  invalid_input: 422,
  rate_limited: 429,
  agent_service_unavailable: 503,
  agent_service_timeout: 504,
  agent_service_error: 502,
  not_configured: 503,
  conflict: 409,
  internal: 500,
};

/**
 * The only place user-facing copy for failures lives. Keeping it here means a
 * blank screen is impossible: any thrown code resolves to a real sentence.
 */
export const FALLBACK_MESSAGE: Record<ErrorCode, string> = {
  unauthorized: "Your session expired. Sign in again to pick up where you left off.",
  not_found: "We couldn't find that. It may have been removed.",
  invalid_input: "Some of that input isn't valid yet.",
  rate_limited: "You're going faster than we can keep up with. Give it a few seconds.",
  agent_service_unavailable:
    "The agent service is busy right now. Your progress is saved — try again in a moment.",
  agent_service_timeout:
    "The agent service took too long to answer. Your progress is saved — try again.",
  agent_service_error:
    "The agent service returned something we couldn't use. Your progress is saved.",
  not_configured:
    "This deployment is missing its agent service credentials. Add LYZR_API_KEY to your environment and restart.",
  conflict: "That's already been done.",
  internal: "Something broke on our side. Your progress is saved.",
};

/** Thrown anywhere in a route handler; caught by `handler()` in src/server/http.ts. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;
  readonly fields?: Record<string, string>;

  constructor(
    code: ErrorCode,
    message?: string,
    options?: { retryable?: boolean; fields?: Record<string, string>; cause?: unknown },
  ) {
    super(message ?? FALLBACK_MESSAGE[code], { cause: options?.cause });
    this.name = "AppError";
    this.code = code;
    this.retryable =
      options?.retryable ??
      ["rate_limited", "agent_service_unavailable", "agent_service_timeout", "agent_service_error", "internal"].includes(
        code,
      );
    this.fields = options?.fields;
  }

  toApiError(): ApiError {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      ...(this.fields ? { fields: this.fields } : {}),
    };
  }
}

export function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    "message" in value &&
    ERROR_CODES.includes((value as ApiError).code)
  );
}
