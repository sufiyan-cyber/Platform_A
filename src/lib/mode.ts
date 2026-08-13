/**
 * The two ways through a campaign.
 *
 * `guided` is the original flow: one decision at a time, with the trade-off
 * behind it explained beside the field. `code` is the same campaign as a file
 * in an editor — every decision at once, in whatever order you like.
 *
 * They are not two products. Both write to the same `Decision` rows through the
 * same validation, so you can switch mid-build and keep everything, and the
 * launch path can't tell which one you used.
 *
 * The preference is a plain cookie rather than a column on `Build`: it's a
 * property of the person, not of the agent they're making, and reading it in the
 * server component is what stops the editor flashing the guided screens for a
 * frame on every reload.
 */
export const BUILD_MODES = ["guided", "code"] as const;

export type BuildMode = (typeof BUILD_MODES)[number];

export const MODE_COOKIE = "af_mode";
export const MODE_PARAM = "mode";

/** 180 days — long enough that a returning developer lands where they left off. */
export const MODE_COOKIE_MAX_AGE = 60 * 60 * 24 * 180;

export function isBuildMode(value: unknown): value is BuildMode {
  return typeof value === "string" && (BUILD_MODES as readonly string[]).includes(value);
}

/** Client-side write. Not httpOnly by design — it's a UI preference, not a credential. */
export function rememberMode(mode: BuildMode): void {
  if (typeof document === "undefined") return;
  document.cookie = `${MODE_COOKIE}=${mode}; path=/; max-age=${MODE_COOKIE_MAX_AGE}; samesite=lax`;
}
