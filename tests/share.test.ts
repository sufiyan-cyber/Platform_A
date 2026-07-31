import { describe, expect, it } from "vitest";
import { SHARE_CHAT_LIMIT, toShareState } from "@/server/share";
import { handleFromEmail, initialsFor } from "@/lib/handle";

/**
 * The share link is the one surface an unauthenticated stranger can reach, so
 * the properties worth pinning down are the ones that decide whether a revoked
 * link is really revoked and whether the visitor budget can be miscounted.
 *
 * `loadSharedBuild` and the visitor-chat guards need a database and are covered
 * by exercising the real route; what's here is the pure shaping either side of
 * them, plus the display-name derivation the badge depends on.
 */

describe("toShareState", () => {
  const unshared = {
    shareToken: null,
    sharedAt: null,
    shareChatEnabled: true,
    shareChatCount: 0,
  };

  it("reports an unshared build as having no link", () => {
    const state = toShareState(unshared);
    expect(state.token).toBeNull();
    expect(state.sharedAt).toBeNull();
  });

  it("serialises the share date, so the wire format stays JSON", () => {
    const state = toShareState({
      ...unshared,
      shareToken: "abc",
      sharedAt: new Date("2026-07-30T10:00:00.000Z"),
    });
    expect(state.sharedAt).toBe("2026-07-30T10:00:00.000Z");
    expect(state.token).toBe("abc");
  });

  it("always carries the limit alongside the count", () => {
    // The owner panel renders "used/limit"; shipping the limit from the server
    // means the number can be changed in one place without a stale client.
    const state = toShareState({ ...unshared, shareChatCount: 12 });
    expect(state.chatUsed).toBe(12);
    expect(state.chatLimit).toBe(SHARE_CHAT_LIMIT);
  });

  it("passes the owner's reply switch straight through", () => {
    expect(toShareState({ ...unshared, shareChatEnabled: false }).chatEnabled).toBe(false);
  });
});

describe("handleFromEmail", () => {
  it("drops the trailing digits people add to claim a taken address", () => {
    expect(handleFromEmail("sufiyanbitwise799@gmail.com")).toBe("Sufiyanbitwise");
    expect(handleFromEmail("dana2@example.com")).toBe("Dana");
  });

  it("treats separators as word breaks and title-cases each word", () => {
    expect(handleFromEmail("dana.ruiz@example.com")).toBe("Dana Ruiz");
    expect(handleFromEmail("dana_ruiz@example.com")).toBe("Dana Ruiz");
    expect(handleFromEmail("dana-ruiz@example.com")).toBe("Dana Ruiz");
  });

  it("strips gmail-style +tags, which are routing, not names", () => {
    expect(handleFromEmail("dana+agentforge@example.com")).toBe("Dana");
  });

  it("keeps digits that aren't trailing", () => {
    // "web3" is a word someone chose, not collision noise.
    expect(handleFromEmail("web3.dana@example.com")).toBe("Web3 Dana");
  });

  it("falls back rather than rendering an empty badge", () => {
    expect(handleFromEmail("123@example.com")).toBe("developer");
    expect(handleFromEmail("@example.com")).toBe("developer");
    expect(handleFromEmail("")).toBe("developer");
  });

  it("bounds the length so a pathological address can't break the layout", () => {
    expect(handleFromEmail(`${"a".repeat(200)}@example.com`).length).toBe(40);
  });
});

describe("initialsFor", () => {
  it("uses first and last initial for multi-word handles", () => {
    expect(initialsFor("Dana Ruiz")).toBe("DR");
    expect(initialsFor("Dana Maria Ruiz")).toBe("DR");
  });

  it("uses the first two characters of a single word", () => {
    expect(initialsFor("Sufiyanbitwise")).toBe("SU");
  });

  it("never returns an empty string", () => {
    expect(initialsFor("")).toBe("??");
    expect(initialsFor("   ")).toBe("??");
  });
});
