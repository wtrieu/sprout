/**
 * Story-engine constants shared across the premise pipeline, API routes, and
 * UI. Safe to import from client components (no node APIs).
 */

/**
 * Generation-engine version stamped on premises and stories. Taste
 * distillation reads only the current version's window, so template-era
 * rejections (whose lesson — the template itself — is already encoded in the
 * v2 redesign) can never haunt the new editorial memo.
 *   1 = template era (hardcoded bedtime prompt)
 *   2 = premise-first commissioned library
 *   3 = nonfiction shelf + layered second-look illustrations
 */
export const ENGINE_VERSION = 3;

/** One-tap taste-signal chips for draft rejection and premise passes. */
export const REJECT_REASONS = [
  { key: "samey", label: "Samey" },
  { key: "clunky", label: "Clunky" },
  { key: "doesnt-make-sense", label: "Doesn't make sense" },
  { key: "too-preachy", label: "Too preachy" },
  { key: "wrong-topic", label: "Wrong topic" },
  { key: "not-for-us", label: "Not for us" },
] as const;

export type RejectReason = (typeof REJECT_REASONS)[number]["key"];

export const rejectReasonKeys = REJECT_REASONS.map((r) => r.key);

/** Character-reference weight appended alongside --cref. */
export const CREF_WEIGHT = 60;

/**
 * Append the page-1 character reference to a Midjourney prompt. The parent
 * pastes their chosen page-1 image URL once (stories.crefUrl); the review UI
 * runs every later page's prompt through this helper so the character stays
 * consistent without hand-editing each prompt. Lives here (not storyArt.ts)
 * because the review page is a client component and this module is the
 * node-free home for shared story constants.
 */
export const withCref = (prompt: string, crefUrl: string | null | undefined): string => {
  const url = crefUrl?.trim();
  return url ? `${prompt} --cref ${url} --cw ${CREF_WEIGHT}` : prompt;
};
