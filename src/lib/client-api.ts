"use client";

import type { ApiError, ApiResult } from "@/lib/api-error";
import { FALLBACK_MESSAGE, isApiError } from "@/lib/api-error";

/**
 * The only way the client talks to the server.
 *
 * It never throws. Every call resolves to the same discriminated union, so call
 * sites are forced to handle failure — which is how "no blank screens" is
 * enforced structurally rather than by remembering to add try/catch.
 *
 * A dropped connection, an HTML error page from a proxy, and a clean 503 all
 * arrive here as the same typed `ApiError`.
 */
export async function call<T>(
  path: string,
  init?: { method?: string; body?: unknown; signal?: AbortSignal },
): Promise<ApiResult<T>> {
  try {
    const response = await fetch(path, {
      method: init?.method ?? "GET",
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
      body: init?.body ? JSON.stringify(init.body) : undefined,
      signal: init?.signal,
      cache: "no-store",
      credentials: "same-origin",
    });

    const text = await response.text();

    let parsed: unknown = null;
    if (text.trim()) {
      try {
        parsed = JSON.parse(text);
      } catch {
        // A proxy or platform error page — not our JSON contract.
        return { ok: false, error: networkError(response.status) };
      }
    }

    if (isResult<T>(parsed)) return parsed;

    // Well-formed HTTP, malformed envelope. Treat as server-side.
    return {
      ok: false,
      error: {
        code: "internal",
        message: FALLBACK_MESSAGE.internal,
        retryable: true,
      },
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return {
        ok: false,
        error: { code: "internal", message: "Request cancelled.", retryable: true },
      };
    }
    return {
      ok: false,
      error: {
        code: "agent_service_unavailable",
        message: "You appear to be offline. Your progress is saved — reconnect and try again.",
        retryable: true,
      },
    };
  }
}

function isResult<T>(value: unknown): value is ApiResult<T> {
  if (typeof value !== "object" || value === null || !("ok" in value)) return false;
  const record = value as { ok: unknown; error?: unknown };
  if (record.ok === true) return true;
  return record.ok === false && isApiError(record.error);
}

function networkError(status: number): ApiError {
  if (status === 401) {
    return { code: "unauthorized", message: FALLBACK_MESSAGE.unauthorized, retryable: false };
  }
  if (status === 429) {
    return { code: "rate_limited", message: FALLBACK_MESSAGE.rate_limited, retryable: true };
  }
  if (status >= 500) {
    return {
      code: "internal",
      message: "The server had a problem handling that. Your progress is saved.",
      retryable: true,
    };
  }
  return { code: "internal", message: FALLBACK_MESSAGE.internal, retryable: true };
}

/* ── Convenience wrappers ──────────────────────────────────────────────────── */

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => call<T>(path, { signal }),
  post: <T>(path: string, body?: unknown, signal?: AbortSignal) =>
    call<T>(path, { method: "POST", body, signal }),
  put: <T>(path: string, body?: unknown, signal?: AbortSignal) =>
    call<T>(path, { method: "PUT", body, signal }),
  patch: <T>(path: string, body?: unknown, signal?: AbortSignal) =>
    call<T>(path, { method: "PATCH", body, signal }),
  del: <T>(path: string, signal?: AbortSignal) => call<T>(path, { method: "DELETE", signal }),
};
