/**
 * The kid version of a bookmarked node: the one-pager re-told for the child
 * at their age today, in words a parent would say aloud, plus one question or
 * tiny activity for today. The one-pager is the source of truth — the model
 * re-explains it, it does not research — and the bookmark row is the job
 * status (`kidStatus`), same as rungs and maps.
 *
 * Runs on the headless `claude -p` path with the writer model, never qwen3.
 */
import { and, desc, eq, isNull, lt, ne, or } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "../../db/client";
import { atlasBookmarks, atlasMaps, atlasNodes, children } from "../../db/schema";
import { ageInMonths, formatAge } from "../age";
import { ageBand } from "../skills/storyText";
import { NONFICTION_FLOOR } from "../stories/lanes";
import { atlasModels, cliLlm, type AtlasLlm } from "./llm";
import { rungFor, wordCount } from "./rungs";
import { KID_STALE_MS, spawnAtlasJob } from "./runner";
import { stripVisualMarkers } from "./visuals";

export type BookmarkRow = typeof atlasBookmarks.$inferSelect;
type NodeRow = typeof atlasNodes.$inferSelect;

/** Word budget for `kid_md` by the child's age in months. */
export const kidWordBudget = (months: number): number =>
  months < 18 ? 60 : months < 30 ? 90 : months < 48 ? 130 : 180;

export const TODAY_MAX_WORDS = 40;

/**
 * Letters outside the Latin script (CJK, Cyrillic, Arabic…) mean the model
 * drifted languages; digits, punctuation, symbols and emoji are not letters.
 */
export const hasNonLatinLetters = (s: string): boolean => {
  for (const ch of s) {
    if (/\p{L}/u.test(ch) && !/\p{Script=Latin}/u.test(ch)) return true;
  }
  return false;
};

/** Budget and script problems with a draft; empty means it passes. */
export const kidProblems = (draft: { kid_md: string; today: string }, months: number): string[] => {
  const problems: string[] = [];
  const budget = kidWordBudget(months);
  const kidWords = wordCount(draft.kid_md);
  if (kidWords > budget) problems.push(`kid_md is ${kidWords} words; the limit is ${budget}`);
  const todayWords = wordCount(draft.today);
  if (todayWords > TODAY_MAX_WORDS) {
    problems.push(`today is ${todayWords} words; the limit is ${TODAY_MAX_WORDS}`);
  }
  if (hasNonLatinLetters(draft.kid_md) || hasNonLatinLetters(draft.today)) {
    problems.push("write in English using Latin letters only");
  }
  // kid_md feeds mdToHtml like a rung body does, so it gets the same lint:
  // links and raw markup must never reach the renderer (rungs.ts does this
  // for rung bodies; a prompt rule alone is not a guarantee).
  const spoken = `${draft.kid_md}\n${draft.today}`;
  if (/\]\(|https?:\/\/|www\./i.test(spoken)) {
    problems.push("no links or URLs — plain spoken words only");
  }
  if (/<[a-z/!]/i.test(spoken)) {
    problems.push("no HTML or angle-bracket markup — plain spoken words only");
  }
  return problems;
};

/** The zod shape the model must return, with the budgets baked in so the repair pass sees them. */
export const kidSchema = (months: number) =>
  z
    .object({ kid_md: z.string().trim().min(1), today: z.string().trim().min(1) })
    .superRefine((v, ctx) => {
      for (const message of kidProblems(v, months)) ctx.addIssue({ code: "custom", message });
    });

const ONEPAGER_CHARS = 9000;

export const buildKidPrompt = (input: {
  name: string;
  months: number;
  node: Pick<NodeRow, "title" | "blurb" | "kind">;
  onepagerMd: string;
  note: string | null;
}): string => {
  const band = ageBand(input.months);
  const budget = kidWordBudget(input.months);
  const source = stripVisualMarkers(input.onepagerMd)
    .replace(/\n### Further reading[\s\S]*$/, "")
    .slice(0, ONEPAGER_CHARS);
  return `You are re-telling an idea from a parent's own reading for their child, ${input.name}, who is ${formatAge(input.months)} old.

THIS NODE (${input.node.kind}): ${input.node.title} — ${input.node.blurb}

THE SOURCE OF TRUTH (the parent's one-pager; say nothing it does not support):
${source}
${input.note ? `\nWhy the parent saved it (their words, steer by this): ${input.note}\n` : ""}
Write two things:
1. kid_md — the idea re-explained for ${input.name}, as words a parent would say aloud: at most ${budget} words, plain sentences, no headings, no bullets, no links, no markdown. ${band.language} ${NONFICTION_FLOOR}
2. today — ONE question or tiny activity for today, using ordinary things at home, at most ${TODAY_MAX_WORDS} words, addressed to ${input.name}.

Write in English, Latin letters only. Return JSON only, no prose: { "kid_md": "...", "today": "..." }`;
};

export type KidResult = { ok: true; bookmark: BookmarkRow } | { ok: false; error: string };

export type KidDeps = {
  llm?: AtlasLlm;
  now?: Date;
  log?: (msg: string) => void;
  /**
   * The claim this job runs under: the kidStartedAt its spawner wrote
   * (`job:atlas kid --stamp <ms>`). The job only writes while the row is
   * still `drafting` with exactly this stamp, so a job that was reaped and
   * superseded by a newer "Try again" cannot clobber the newer draft. Without
   * it (a hand-run job) the job claims the row itself, unconditionally.
   */
  stamp?: Date;
};

const SUPERSEDED = "superseded by a newer kid draft — nothing written";

export const generateKidVersion = async (
  db: DB,
  bookmarkId: number,
  deps: KidDeps = {},
): Promise<KidResult> => {
  const llm = deps.llm ?? cliLlm;
  const log = deps.log ?? console.log;
  const now = deps.now ?? new Date();

  const bookmark = db.select().from(atlasBookmarks).where(eq(atlasBookmarks.id, bookmarkId)).get();
  if (!bookmark) return { ok: false, error: `bookmark #${bookmarkId} not found` };

  // Whose draft is this? With a spawner's stamp, the row must still carry it;
  // by hand, stamp the row now (the reaper's clock) and own that.
  let stamp: Date;
  if (deps.stamp) {
    if (bookmark.kidStatus !== "drafting" || bookmark.kidStartedAt?.getTime() !== deps.stamp.getTime()) {
      log(`bookmark #${bookmarkId}: ${SUPERSEDED}`);
      return { ok: false, error: SUPERSEDED };
    }
    stamp = deps.stamp;
  } else {
    const claimed = db
      .update(atlasBookmarks)
      .set({ kidStatus: "drafting", kidError: null, kidStartedAt: now })
      .where(eq(atlasBookmarks.id, bookmarkId))
      .returning({ kidStartedAt: atlasBookmarks.kidStartedAt })
      .get();
    stamp = claimed!.kidStartedAt!;
  }
  // Every terminal write is conditional on still owning the claim.
  const mine = and(
    eq(atlasBookmarks.id, bookmarkId),
    eq(atlasBookmarks.kidStatus, "drafting"),
    eq(atlasBookmarks.kidStartedAt, stamp),
  );
  const fail = (message: string): KidResult => {
    const error = message.slice(0, 2000);
    const hit = db
      .update(atlasBookmarks)
      .set({ kidStatus: "failed", kidError: error })
      .where(mine)
      .returning({ id: atlasBookmarks.id })
      .get();
    log(`bookmark #${bookmarkId} kid version failed: ${error}${hit ? "" : ` (${SUPERSEDED})`}`);
    return { ok: false, error };
  };

  const node = db.select().from(atlasNodes).where(eq(atlasNodes.id, bookmark.nodeId)).get();
  if (!node) return fail(`node #${bookmark.nodeId} not found`);
  const child = db.select().from(children).where(eq(children.id, bookmark.childId)).get();
  if (!child) return fail(`child #${bookmark.childId} not found`);

  const onepager = rungFor(db, node.id, "onepager");
  if (!onepager || onepager.status !== "ready" || !onepager.bodyMd) {
    return fail(
      `The one-pager for "${node.title}" is not ready yet — open the node to draft it, then regenerate.`,
    );
  }

  const months = ageInMonths(child.dob, now);
  const model = atlasModels().writer;
  try {
    log(`kid version for bookmark #${bookmarkId}: "${node.title}" for ${child.name}, ${formatAge(months)}, model=${model}`);
    const draft = llm(
      buildKidPrompt({
        name: child.name,
        months,
        node,
        onepagerMd: onepager.bodyMd,
        note: bookmark.note,
      }),
      kidSchema(months),
      { model, label: "kid version" },
    );
    // The schema already carries these checks; an injected llm that skips
    // validation must not be able to store an over-budget or non-Latin draft.
    const problems = kidProblems(draft, months);
    if (problems.length > 0) return fail(problems.join("; "));

    const stored = db
      .update(atlasBookmarks)
      .set({
        kidMd: draft.kid_md.trim(),
        kidToday: draft.today.trim(),
        kidAgeMonths: months,
        kidStatus: "ready",
        kidError: null,
      })
      .where(mine)
      .returning()
      .get();
    if (!stored) {
      log(`bookmark #${bookmarkId}: draft finished but ${SUPERSEDED}`);
      return { ok: false, error: SUPERSEDED };
    }
    log(`bookmark #${bookmarkId} kid version ready (${wordCount(draft.kid_md)} words)`);
    return { ok: true, bookmark: stored };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
};

// --- the drafting claim (regenerate) ------------------------------------------------

/**
 * Atomically flip a bookmark's kid version to `drafting` — ONE conditional
 * `UPDATE … WHERE … RETURNING`, the same claim shape as
 * runner.promoteNextQueuedMap. It succeeds only if the row is not already
 * drafting, or is drafting but stale (a run that died; null stamp counts as
 * stale, like runner.isStale). SQLite serialises writers, so of two
 * concurrent regenerations exactly one gets the row back; the other gets
 * null and must not spawn.
 */
export const claimKidDraft = (db: DB, bookmarkId: number, now = new Date()): BookmarkRow | null =>
  db
    .update(atlasBookmarks)
    .set({ kidStatus: "drafting", kidError: null, kidStartedAt: now })
    .where(
      and(
        eq(atlasBookmarks.id, bookmarkId),
        or(
          ne(atlasBookmarks.kidStatus, "drafting"),
          isNull(atlasBookmarks.kidStartedAt),
          lt(atlasBookmarks.kidStartedAt, new Date(now.getTime() - KID_STALE_MS)),
        ),
      ),
    )
    .returning()
    .get() ?? null;

export type RegenerateKidResult =
  | { status: "started"; bookmark: BookmarkRow }
  | { status: "busy"; bookmark: BookmarkRow }
  | { status: "not-found" };

/**
 * Spawn the detached kid job under a claim: `stamp` is the row's kidStartedAt
 * as stored (read it back from the claiming write), so the job can tell
 * whether it still owns the row when it finishes.
 */
export const spawnKidJob = (bookmarkId: number, stamp: Date): void =>
  spawnAtlasJob(["kid", "--bookmark", String(bookmarkId), "--stamp", String(stamp.getTime())]);

/**
 * "Try again" on a kid version: claim the row, and spawn the detached job
 * only if this call won the claim. A second press while a fresh draft is in
 * flight is `busy` (the route answers 409) and spawns nothing.
 */
export const regenerateKid = (
  db: DB,
  bookmarkId: number,
  deps: { spawn?: (bookmarkId: number, stamp: Date) => void; now?: Date } = {},
): RegenerateKidResult => {
  const claimed = claimKidDraft(db, bookmarkId, deps.now);
  if (claimed) {
    (deps.spawn ?? spawnKidJob)(bookmarkId, claimed.kidStartedAt!);
    return { status: "started", bookmark: claimed };
  }
  const row = db.select().from(atlasBookmarks).where(eq(atlasBookmarks.id, bookmarkId)).get();
  return row ? { status: "busy", bookmark: row } : { status: "not-found" };
};

/**
 * The topic a "Make it a story" button would POST to /api/stories/express
 * (its `topic` is capped at 200 chars). The parent's own note leads: it says
 * why the idea mattered, which is what steers the book.
 */
// HOOK(atlas-story)
export const storyTopicForBookmark = (
  node: Pick<NodeRow, "title" | "blurb">,
  bookmark: Pick<BookmarkRow, "note">,
): string => {
  const base = `A true story book about ${node.title}: ${node.blurb.trim()}`;
  const note = bookmark.note?.trim();
  const stop = /[.!?]$/.test(base) ? "" : ".";
  const topic = note ? `${base}${stop} Parent's note: ${note}` : base;
  return topic.length <= 200 ? topic : `${topic.slice(0, 199).trimEnd()}…`;
};

// --- the read shape the bookmark routes and pages share ----------------------------

export type BookmarkView = {
  id: number;
  nodeId: number;
  nodeTitle: string;
  mapId: number;
  mapTitle: string;
  note: string | null;
  targetAgeYears: number | null;
  kidStatus: BookmarkRow["kidStatus"];
  kidMd: string | null;
  kidToday: string | null;
  kidAgeMonths: number | null;
  kidError: string | null;
  storyTopic: string;
  createdAt: Date;
};

/** Bookmarks newest first (optionally one node's), joined to their node and map. */
export const listBookmarkViews = (
  db: DB,
  opts: { nodeId?: number; id?: number } = {},
): BookmarkView[] => {
  const rows = db
    .select({ bookmark: atlasBookmarks, node: atlasNodes, map: atlasMaps })
    .from(atlasBookmarks)
    .innerJoin(atlasNodes, eq(atlasNodes.id, atlasBookmarks.nodeId))
    .innerJoin(atlasMaps, eq(atlasMaps.id, atlasNodes.mapId))
    .orderBy(desc(atlasBookmarks.createdAt), desc(atlasBookmarks.id))
    .all()
    .filter(
      (r) =>
        (opts.nodeId === undefined || r.bookmark.nodeId === opts.nodeId) &&
        (opts.id === undefined || r.bookmark.id === opts.id),
    );
  return rows.map(({ bookmark: b, node, map }) => ({
    id: b.id,
    nodeId: b.nodeId,
    nodeTitle: node.title,
    mapId: map.id,
    mapTitle: map.title,
    note: b.note,
    targetAgeYears: b.targetAgeYears,
    kidStatus: b.kidStatus,
    kidMd: b.kidMd,
    kidToday: b.kidToday,
    kidAgeMonths: b.kidAgeMonths,
    kidError: b.kidError,
    storyTopic: storyTopicForBookmark(node, b),
    createdAt: b.createdAt,
  }));
};
