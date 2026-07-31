import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractAgentId, extractReply } from "@/server/lyzr";
import { AppError } from "@/lib/api-error";
import { __resetRateLimits, consume } from "@/server/rate-limit";

/**
 * The proxy's job is to keep a third-party service's failures from becoming our
 * failures. These cover the two places that can silently corrupt a build: an
 * unrecognised response shape being written to the database as `undefined`, and
 * a transient error being treated as permanent.
 */

describe("extractAgentId", () => {
  it("reads each documented and observed id key", () => {
    expect(extractAgentId({ agent_id: "abc" })).toBe("abc");
    expect(extractAgentId({ agentId: "abc" })).toBe("abc");
    expect(extractAgentId({ _id: "abc" })).toBe("abc");
    expect(extractAgentId({ id: "abc" })).toBe("abc");
  });

  it("prefers the most specific key when several are present", () => {
    // `id` is often an unrelated record id; `agent_id` is the one we want.
    expect(extractAgentId({ id: "wrong", agent_id: "right" })).toBe("right");
  });

  it("finds the id nested inside a wrapper envelope", () => {
    expect(extractAgentId({ data: { agent: { agent_id: "abc" } } })).toBe("abc");
  });

  it("trims surrounding whitespace", () => {
    expect(extractAgentId({ agent_id: "  abc  " })).toBe("abc");
  });

  it("returns null rather than a useless value when nothing usable is present", () => {
    // The caller turns null into a clear error; `undefined` would be written
    // to the build and only fail later, at chat time.
    expect(extractAgentId({})).toBeNull();
    expect(extractAgentId({ agent_id: "" })).toBeNull();
    expect(extractAgentId({ agent_id: "   " })).toBeNull();
    expect(extractAgentId({ status: "ok" })).toBeNull();
    expect(extractAgentId(null)).toBeNull();
    expect(extractAgentId("a string")).toBeNull();
  });
});

describe("extractReply", () => {
  it("reads each plausible reply key", () => {
    expect(extractReply({ response: "hi" })).toBe("hi");
    expect(extractReply({ message: "hi" })).toBe("hi");
    expect(extractReply({ answer: "hi" })).toBe("hi");
    expect(extractReply({ output: "hi" })).toBe("hi");
  });

  it("accepts a bare string body", () => {
    expect(extractReply("hi")).toBe("hi");
  });

  it("unwraps a reply nested one level deeper", () => {
    expect(extractReply({ response: { content: "hi" } })).toBe("hi");
  });

  it("falls back to the raw text captured from a non-JSON 200", () => {
    expect(extractReply({ raw_text: "plain text answer" })).toBe("plain text answer");
  });

  it("returns null for empty or unrecognised payloads", () => {
    expect(extractReply({})).toBeNull();
    expect(extractReply({ response: "" })).toBeNull();
    expect(extractReply({ response: "   " })).toBeNull();
    expect(extractReply({ unrelated: 42 })).toBeNull();
  });

  it("survives a deeply nested payload without recursing forever", () => {
    // Guards the bounded-depth search against a pathological body.
    let deep: Record<string, unknown> = { response: "found" };
    for (let i = 0; i < 50; i++) deep = { nest: deep };

    expect(() => extractReply(deep)).not.toThrow();
  });
});

describe("AppError retryability", () => {
  it("marks transient upstream conditions as retryable", () => {
    expect(new AppError("agent_service_unavailable").retryable).toBe(true);
    expect(new AppError("agent_service_timeout").retryable).toBe(true);
    expect(new AppError("rate_limited").retryable).toBe(true);
  });

  it("marks caller mistakes as non-retryable", () => {
    // Retrying invalid input just wastes a round trip and looks broken.
    expect(new AppError("invalid_input").retryable).toBe(false);
    expect(new AppError("unauthorized").retryable).toBe(false);
    expect(new AppError("not_configured").retryable).toBe(false);
  });

  it("always carries a user-facing message, even with none supplied", () => {
    expect(new AppError("internal").message.length).toBeGreaterThan(10);
  });
});

describe("rate limiting", () => {
  beforeEach(() => {
    __resetRateLimits();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows a burst up to the bucket capacity", () => {
    for (let i = 0; i < 8; i++) {
      expect(() => consume("chat", "user-1")).not.toThrow();
    }
  });

  it("rejects with a 429 once the bucket is empty", () => {
    for (let i = 0; i < 8; i++) consume("chat", "user-1");

    try {
      consume("chat", "user-1");
      expect.unreachable("should have thrown");
    } catch (error) {
      const appError = error as AppError;
      expect(appError.code).toBe("rate_limited");
      expect(appError.retryable).toBe(true);
      expect(appError.message).toMatch(/try again in \d+s/i);
    }
  });

  it("refills over time", () => {
    for (let i = 0; i < 8; i++) consume("chat", "user-1");
    expect(() => consume("chat", "user-1")).toThrow();

    // chat refills at 0.25/s, so 4s buys exactly one more token.
    vi.advanceTimersByTime(4_000);
    expect(() => consume("chat", "user-1")).not.toThrow();
  });

  it("keeps buckets separate per user", () => {
    for (let i = 0; i < 8; i++) consume("chat", "user-1");
    expect(() => consume("chat", "user-2")).not.toThrow();
  });

  it("keeps buckets separate per operation", () => {
    for (let i = 0; i < 8; i++) consume("chat", "user-1");
    expect(() => consume("mentor", "user-1")).not.toThrow();
  });
});
