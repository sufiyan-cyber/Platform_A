/**
 * Display-name derivation.
 *
 * Pure and dependency-free on purpose: `handleFromEmail` runs on the server at
 * sign-in (src/server/auth.ts) and `initialsFor` runs wherever the badge is
 * rendered. Keeping both here means the two halves of "how we show a person"
 * can't drift, and neither drags the database into a unit test.
 */

/**
 * Turns an email local-part into something that reads like a name.
 *
 * Real addresses carry disambiguation noise the person didn't choose —
 * `sufiyanbitwise799@…` naively becomes "Sufiyanbitwise799", which reads like a
 * username. So: `+tags` are discarded, separators become spaces, the digit run
 * at the very end is dropped ("the name I wanted was taken"), and the result is
 * title-cased. Anything that reduces to nothing falls back rather than rendering
 * an empty badge.
 *
 * Only the *last* word loses its digits. Stripping every word turns
 * `web3.dana@…` into "Web Dana", and that 3 is a letter as far as its owner is
 * concerned.
 */
export function handleFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";

  const words = local
    .replace(/\+.*$/, "")
    .split(/[._\-\s]+/)
    .filter(Boolean)
    .map((part, index, all) => (index === all.length - 1 ? part.replace(/\d+$/, "") : part))
    .map((part) => part.trim())
    .filter(Boolean);

  if (words.length === 0) return "developer";

  return words
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
    .slice(0, 40);
}

/** Initials from a display handle: two words → two letters, one word → two chars. */
export function initialsFor(handle: string): string {
  const parts = handle.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}
