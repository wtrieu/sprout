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

/**
 * Style-reference weight appended alongside --sref. Midjourney's default is
 * 100; the landing pipeline runs 250, but that number is tuned for
 * scenery-only art where soaking up everything from the reference is the
 * point. Story pages have a character and per-page content to protect — at
 * 250 the page-1 reference's palette, props, and composition were bleeding
 * into every later page, so this stays at the default: enough to hold the
 * book's look without re-painting page 1 everywhere.
 */
export const STYLE_REF_WEIGHT = 100;

/**
 * Append the page-1 style reference to a Midjourney prompt. The parent pastes
 * their chosen page-1 image URL once (stories.styleRefUrl); the review UI runs
 * every later page's prompt through this helper so the book holds one look
 * without hand-editing each prompt. Lives here (not storyArt.ts) because the
 * review page is a client component and this module is the node-free home for
 * shared story constants.
 *
 * --sref, not --cref: character reference was introduced for V6/Niji 6 and is
 * unsupported on the models people actually run now (Niji 7 dropped it; V7/V8
 * replaced it with --oref). Style reference works across both current
 * families, so this needs no version pin and no upkeep as versions ship.
 */
export const withStyleRef = (prompt: string, styleRefUrl: string | null | undefined): string => {
  const url = styleRefUrl?.trim();
  return url ? `${prompt} --sref ${url} --sw ${STYLE_REF_WEIGHT}` : prompt;
};
