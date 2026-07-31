import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/api-error";
import { __resetRateLimits, consume } from "@/server/rate-limit";

/**
 * The escalation record's only job is to be trustworthy. These cover the two
 * ways it could stop being: storing more (or less) than what was actually said,
 * and letting an anonymous caller write without bound.
 *
 * `db` is mocked rather than hit — this asserts the shape that reaches the
 * database, which is the part that has to be right.
 */

const created: { data: Record<string, unknown> }[] = [];
let countValue = 0;

vi.mock("@/server/db", () => ({
  db: {
    escalation: {
      count: vi.fn(async () => countValue),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        created.push(args);
        return { id: "esc-1", status: "open", createdAt: new Date("2026-07-30T12:00:00Z"), ...args.data };
      }),
      findMany: vi.fn(async () => [
        {
          id: "esc-1",
          reason: null,
          transcript: "not valid json",
          source: "visitor",
          status: "open",
          createdAt: new Date("2026-07-30T12:00:00Z"),
        },
      ]),
    },
  },
}));

const storedTranscript = () =>
  JSON.parse(String(created.at(-1)?.data.transcript)) as { role: string; content: string }[];

beforeEach(() => {
  created.length = 0;
  countValue = 0;
  __resetRateLimits();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("createEscalation", () => {
  const turn = (content: string, role: "user" | "assistant" = "user") => ({ role, content });

  it("stores the reason and the turns that led to it", async () => {
    const { createEscalation } = await import("@/server/escalations");

    const record = await createEscalation({
      buildId: "b1",
      reason: "  needs a person  ",
      transcript: [turn("my order is wrong"), turn("I can't do that", "assistant")],
      source: "owner",
    });

    expect(record.reason).toBe("needs a person");
    expect(record.transcript).toEqual([
      { role: "user", content: "my order is wrong" },
      { role: "assistant", content: "I can't do that" },
    ]);
    expect(created.at(-1)?.data.source).toBe("owner");
    expect(created.at(-1)?.data.status).toBe("open");
  });

  it("treats an absent or blank reason as no reason", async () => {
    const { createEscalation } = await import("@/server/escalations");

    for (const reason of [undefined, "", "   "]) {
      const record = await createEscalation({
        buildId: "b1",
        reason,
        transcript: [],
        source: "owner",
      });
      // A handoff must never be gated behind writing something.
      expect(record.reason).toBeNull();
    }
  });

  it("keeps only the last few turns", async () => {
    const { createEscalation, TRANSCRIPT_TURNS } = await import("@/server/escalations");

    await createEscalation({
      buildId: "b1",
      reason: null,
      transcript: Array.from({ length: 30 }, (_, i) => turn(`turn ${i}`)),
      source: "owner",
    });

    const stored = storedTranscript();
    expect(stored).toHaveLength(TRANSCRIPT_TURNS);
    // The *last* turns, not the first — the end of a conversation is what
    // explains why someone wanted out of it.
    expect(stored.at(-1)?.content).toBe("turn 29");
  });

  it("bounds a single turn so a visitor can't post a novel", async () => {
    const { createEscalation } = await import("@/server/escalations");

    await createEscalation({
      buildId: "b1",
      reason: null,
      transcript: [turn("x".repeat(50_000))],
      source: "visitor",
    });

    expect(storedTranscript()[0].content).toHaveLength(2_000);
  });

  it("drops empty turns and normalises an unknown role", async () => {
    const { createEscalation } = await import("@/server/escalations");

    await createEscalation({
      buildId: "b1",
      reason: null,
      transcript: [
        turn("   "),
        { role: "system" as unknown as "user", content: "injected" },
        turn("real"),
      ],
      source: "visitor",
    });

    // Anything that isn't "user" becomes "assistant" — the record can only ever
    // contain the two roles the panel knows how to label.
    expect(storedTranscript()).toEqual([
      { role: "assistant", content: "injected" },
      { role: "user", content: "real" },
    ]);
  });

  it("refuses once the build hits its lifetime cap", async () => {
    const { createEscalation, ESCALATION_LIMIT } = await import("@/server/escalations");
    countValue = ESCALATION_LIMIT;

    await expect(
      createEscalation({ buildId: "b1", reason: null, transcript: [], source: "visitor" }),
    ).rejects.toMatchObject({ code: "conflict", retryable: false });

    // Nothing was written.
    expect(created).toHaveLength(0);
  });
});

describe("listEscalations", () => {
  it("renders a corrupt transcript as empty instead of throwing", async () => {
    const { listEscalations } = await import("@/server/escalations");

    const [record] = await listEscalations("b1");

    expect(record.transcript).toEqual([]);
    expect(record.source).toBe("visitor");
  });
});

describe("escalate rate limit", () => {
  it("allows a small burst then holds an anonymous caller off", () => {
    for (let i = 0; i < 4; i++) {
      expect(() => consume("escalate", "1.2.3.4")).not.toThrow();
    }

    try {
      consume("escalate", "1.2.3.4");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as AppError).code).toBe("rate_limited");
    }

    // A different visitor is unaffected.
    expect(() => consume("escalate", "5.6.7.8")).not.toThrow();
  });
});
