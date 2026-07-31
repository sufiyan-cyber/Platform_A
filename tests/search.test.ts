import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractSources } from "@/server/search";
import { __resetRateLimits } from "@/server/rate-limit";
import { getCampaign } from "@/campaigns";
import type { Campaign } from "@/campaigns/types";

/**
 * Grounding is the feature with the worst failure mode in the product: an agent
 * that appears to cite sources but doesn't. So these tests are weighted towards
 * the paths where a citation could become unverifiable — a bad URL reaching an
 * href, a source surviving with fields we never received — and towards proving
 * that *every* no-sources path still tells the model it has nothing to cite.
 */

describe("extractSources", () => {
  const result = (over: Record<string, unknown> = {}) => ({
    title: "A title",
    url: "https://example.com/a",
    content: "Some extracted page text.",
    score: 0.9,
    ...over,
  });

  it("reads the fields the live API actually returns", () => {
    const [source] = extractSources({ results: [result()] }, 5);

    expect(source).toEqual({
      title: "A title",
      url: "https://example.com/a",
      snippet: "Some extracted page text.",
      publishedDate: null,
    });
  });

  it("keeps a publication date when the provider supplies one", () => {
    // Only present when the query is routed to the news index — verified live.
    const [source] = extractSources(
      { results: [result({ published_date: "Fri, 24 Jul 2026 17:17:58 GMT" })] },
      5,
    );

    expect(source.publishedDate).toBe("Fri, 24 Jul 2026 17:17:58 GMT");
  });

  it("reports no date rather than inventing one", () => {
    // A fabricated publication date is authoritative-looking and unfalsifiable
    // at a glance, which makes it the most expensive thing we could guess at.
    expect(extractSources({ results: [result({ published_date: "" })] }, 5)[0].publishedDate).toBeNull();
    expect(extractSources({ results: [result({ published_date: 12345 })] }, 5)[0].publishedDate).toBeNull();
    expect(extractSources({ results: [result()] }, 5)[0].publishedDate).toBeNull();
  });

  it("drops results whose URL could not be clicked or trusted", () => {
    const sources = extractSources(
      {
        results: [
          result({ url: "javascript:alert(1)" }),
          result({ url: "data:text/html,<script>" }),
          result({ url: "not a url at all" }),
          result({ url: "" }),
          result({ url: undefined }),
          result({ url: "https://good.example/page" }),
        ],
      },
      10,
    );

    expect(sources).toHaveLength(1);
    expect(sources[0].url).toBe("https://good.example/page");
  });

  it("falls back to the hostname when a page has no usable title", () => {
    const [source] = extractSources(
      { results: [result({ title: "", url: "https://www.example.com/deep/path" })] },
      5,
    );

    // Naming the host is a fact about the URL; summarising the page would not be.
    expect(source.title).toBe("example.com");
  });

  it("never returns more sources than asked for", () => {
    const results = Array.from({ length: 20 }, (_, i) =>
      result({ url: `https://example.com/${i}` }),
    );

    expect(extractSources({ results }, 5)).toHaveLength(5);
    expect(extractSources({ results }, 1)).toHaveLength(1);
  });

  it("truncates a long snippet instead of shipping the whole page", () => {
    const [source] = extractSources({ results: [result({ content: "x".repeat(9_000) })] }, 5);

    expect(source.snippet.length).toBeLessThanOrEqual(1_200);
    expect(source.snippet.endsWith("…")).toBe(true);
  });

  it("degrades to zero sources on an unrecognised response shape", () => {
    // The caller treats an empty list as "we found nothing", which is already an
    // honest thing to say — so a shape change costs sources, never correctness.
    expect(extractSources({}, 5)).toEqual([]);
    expect(extractSources({ results: "nope" }, 5)).toEqual([]);
    expect(extractSources(null, 5)).toEqual([]);
    expect(extractSources({ results: [null, 42, "x"] }, 5)).toEqual([]);
  });

  it("tolerates a missing snippet without dropping the citation", () => {
    const [source] = extractSources({ results: [result({ content: undefined })] }, 5);

    expect(source.snippet).toBe("");
    expect(source.url).toBe("https://example.com/a");
  });
});

describe("groundMessage", () => {
  const sources = [
    {
      title: "First source",
      url: "https://one.example/a",
      snippet: "Body one.",
      publishedDate: "Fri, 24 Jul 2026 17:17:58 GMT",
    },
    { title: "Second source", url: "https://two.example/b", snippet: "Body two.", publishedDate: null },
  ];

  const groundedCampaign = {
    id: "test",
    retrieval: { kind: "web", maxSources: 5 },
  } as unknown as Campaign;

  const plainCampaign = { id: "test" } as unknown as Campaign;

  beforeEach(() => {
    __resetRateLimits();
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock("@/server/search");
  });

  async function load(searchImpl: () => Promise<typeof sources>) {
    vi.doMock("@/server/search", () => ({ searchWeb: vi.fn(searchImpl) }));
    return import("@/server/grounding");
  }

  it("leaves an ungrounded campaign's message completely untouched", async () => {
    const { groundMessage } = await load(async () => sources);

    const result = await groundMessage({
      campaign: plainCampaign,
      message: "hello",
      identity: "u1",
    });

    // The support desk must be bit-for-bit unaffected by this feature existing —
    // it is the fallback if retrieval has to be switched off before the demo.
    expect(result).toEqual({ message: "hello", sources: [], status: "off" });
  });

  it("injects numbered sources and preserves the original question", async () => {
    const { groundMessage } = await load(async () => sources);

    const result = await groundMessage({
      campaign: groundedCampaign,
      message: "what happened this week?",
      identity: "u1",
    });

    expect(result.status).toBe("grounded");
    expect(result.sources).toEqual(sources);
    expect(result.message).toContain("[1] First source");
    expect(result.message).toContain("https://one.example/a");
    expect(result.message).toContain("[2] Second source");
    expect(result.message).toContain("published: Fri, 24 Jul 2026 17:17:58 GMT");
    // The user's actual words must survive composition, or the agent answers
    // the wrapper instead of the question.
    expect(result.message).toContain("what happened this week?");
  });

  it("forbids citing anything outside the injected list", async () => {
    const { groundMessage } = await load(async () => sources);

    const result = await groundMessage({
      campaign: groundedCampaign,
      message: "q",
      identity: "u1",
    });

    expect(result.message).toMatch(/never write a citation number, a URL, or a publication date/i);
  });

  it.each([
    ["an empty result set", async () => [], "no_results"],
    [
      "a missing API key",
      async () => {
        const { AppError } = await import("@/lib/api-error");
        throw new AppError("not_configured");
      },
      "not_configured",
    ],
    [
      "an unreachable provider",
      async () => {
        throw new Error("ECONNRESET");
      },
      "unavailable",
    ],
  ])("tells the agent it has nothing to cite when search yields %s", async (_label, impl, status) => {
    const { groundMessage } = await load(impl as () => Promise<typeof sources>);

    const result = await groundMessage({
      campaign: groundedCampaign,
      message: "q",
      identity: "u1",
    });

    expect(result.status).toBe(status);
    expect(result.sources).toEqual([]);
    // Every failure path lands on the same instruction. This is the guarantee:
    // there is no way for a grounded agent to be left guessing whether it
    // searched, because that guess is how invented citations get produced.
    expect(result.message).toMatch(/do not invent a citation/i);
    expect(result.message).toMatch(/could not look anything up/i);
    expect(result.message).toContain("q");
  });

  it("answers without sources rather than failing when the search bucket is empty", async () => {
    const { groundMessage } = await load(async () => sources);
    const { consume } = await import("@/server/rate-limit");

    // Drain the search bucket (capacity 20) for this identity.
    for (let i = 0; i < 20; i++) consume("search", "u-burst");

    const result = await groundMessage({
      campaign: groundedCampaign,
      message: "q",
      identity: "u-burst",
    });

    expect(result.status).toBe("unavailable");
    expect(result.message).toMatch(/do not invent a citation/i);
  });
});

describe("campaign retrieval config", () => {
  it("grounds the research analyst and nothing else", () => {
    // Doubles as the escape hatch's regression guard: if retrieval has to be
    // disabled before the demo, deleting this one field is the whole change.
    expect(getCampaign("research-analyst")?.retrieval).toEqual({ kind: "web", maxSources: 5 });
    expect(getCampaign("support-desk")?.retrieval).toBeUndefined();
  });
});
