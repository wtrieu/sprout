/**
 * Taste memory: the weekly distillation that turns the parent's review
 * behavior into a short editor's memo (data/editorial-taste.md) prepended to
 * the premise-stage prompt.
 *
 * Noise guardrails (the archive must never become sludge in the prompts):
 *   1. The writer never sees rejected drafts — raw rejected text has exactly
 *      one consumer: this distiller. Only the memo enters generation prompts,
 *      hard-capped at MEMO_MAX_LINES so prompt weight stays constant.
 *   2. Regime-tagged rolling window: only post-template engines' last ~30
 *      days count (engineVersion >= 2). Template-era rejections are excluded
 *      outright — the template itself was the problem there, a lesson already
 *      encoded in the redesign. Later engine bumps (v2 → v3) refine the same
 *      premise-first regime, so their taste signal stays valid across bumps.
 *   3. Mostly-positive memo: approvals/favorites drive "more like this"; the
 *      avoid list is capped at ~5 items with at most 1-2 quoted phrases.
 *   4. Text is evidence, not a museum: rejected drafts keep pages for 90
 *      days, then are compressed to a one-line epitaph.
 */
import fs from "node:fs";
import path from "node:path";
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { DB } from "../../db/client";
import { premises, stories, storyPages } from "../../db/schema";
import { callClaude, extractResultText, storyModels, type CallClaude } from "./claudeCli";

export const MEMO_MAX_LINES = 40;
/** First post-template engine — taste signal counts from here on (guardrail 2). */
const TASTE_MIN_ENGINE_VERSION = 2;
const WINDOW_DAYS = 30;
const DISTILL_EVERY_DAYS = 7;
const EPITAPH_AFTER_DAYS = 90;
/** Don't bother distilling before this many decided signals exist. */
const MIN_SIGNALS = 3;

export const tasteMemoPath = (): string =>
  process.env.EDITORIAL_TASTE_PATH ?? path.resolve(process.cwd(), "../../data/editorial-taste.md");

/** The memo for the premise prompt, or "" when none exists yet. */
export const readTasteMemo = (): string => {
  try {
    const text = fs.readFileSync(tasteMemoPath(), "utf8").trim();
    return text.split("\n").slice(0, MEMO_MAX_LINES).join("\n");
  } catch {
    return "";
  }
};

type TasteSignals = {
  kept: string[];
  rejected: string[];
  passes: string[];
  total: number;
};

const collectSignals = (db: DB): TasteSignals => {
  const cutoff = new Date(Date.now() - WINDOW_DAYS * 86400 * 1000);

  const engineStories = db
    .select()
    .from(stories)
    .where(
      and(gte(stories.engineVersion, TASTE_MIN_ENGINE_VERSION), gte(stories.createdAt, cutoff)),
    )
    .all();

  const kept = engineStories
    .filter((s) => ["approved", "ready"].includes(s.status))
    .map(
      (s) =>
        `- KEPT${s.favorite ? " + FAVORITED" : ""}: "${s.title}" [${s.lane ?? "?"}] tags: ${(s.tags ?? []).join(", ")}${(s.readCount ?? 0) > 1 ? ` — read ${s.readCount} times` : ""}`,
    );

  // "superseded" marks administrative clear-outs (a regime change retired the
  // old queue) — not taste. Neither kept nor rejected signal.
  const rejectedRows = engineStories.filter(
    (s) => s.status === "rejected" && s.rejectReason !== "superseded",
  );
  const rejected = rejectedRows.map((s) => {
    const pages = s.epitaph
      ? []
      : db
          .select({ text: storyPages.text })
          .from(storyPages)
          .where(eq(storyPages.storyId, s.id))
          .all();
    const excerpt = pages
      .map((p) => p.text)
      .join(" / ")
      .slice(0, 600);
    return `- REJECTED (${s.rejectReason ?? "no reason"}${s.rejectNote ? `: ${s.rejectNote}` : ""}): "${s.title}" [${s.lane ?? "?"}] tags: ${(s.tags ?? []).join(", ")}${s.epitaph ? ` — ${s.epitaph}` : excerpt ? `\n  text: ${excerpt}` : ""}`;
  });

  const passes = db
    .select()
    .from(premises)
    .where(
      and(
        gte(premises.engineVersion, TASTE_MIN_ENGINE_VERSION),
        gte(premises.createdAt, cutoff),
        inArray(premises.status, ["passed", "rejected"]),
      ),
    )
    .all()
    .filter((p) => p.passReason !== "expired" && p.passReason !== "superseded")
    .map((p) =>
      p.status === "passed"
        ? `- PREMISE PASSED (${p.passReason ?? "no reason"}): "${p.title}" [${p.lane}] — ${p.pitch.slice(0, 120)}`
        : `- DRAFT KILLED BY EDITOR-JUDGE: "${p.title}" [${p.lane}] — ${(p.judgeVerdict ?? "").slice(0, 160)}`,
    );

  return { kept, rejected, passes, total: kept.length + rejected.length + passes.length };
};

const buildDistillPrompt = (signals: TasteSignals): string =>
  `You are the editorial director of a tiny home press that publishes picture books for one child. Below is the last ${WINDOW_DAYS} days of the parent's review behavior. Distill it into a short EDITOR'S MEMO that will be pasted, verbatim, into future premise-writing prompts as "the house taste."

RULES for the memo:
- At most ${MEMO_MAX_LINES} lines of markdown. Shorter is better.
- MOSTLY POSITIVE: lead with hits and WHY they hit ("more like this"), then current appetite (what to try next). Rejections vastly outnumber approvals in any review pile — a memo that mirrored that ratio would just be a wall of don'ts.
- The "avoid" list: at most 5 items, each a pattern (not a title), with AT MOST 1-2 short quoted phrases as banned-cliché examples.
- Be specific and concrete. "Rhythm sells a page" beats "make it good."
- No preamble, no sign-off — the memo body only, starting with a "## More like this" heading.

WHAT THE FAMILY KEPT:
${signals.kept.join("\n") || "(nothing kept this window yet)"}

WHAT THE FAMILY REJECTED (with reasons; text excerpts are EVIDENCE for diagnosis, never material to reuse):
${signals.rejected.join("\n") || "(no rejections)"}

PREMISE-LEVEL SIGNALS (passes and judge kills):
${signals.passes.join("\n") || "(none)"}`;

export type DistillResult = { distilled: boolean; message: string };

/** Run the distillation now (frontier-model call) and write the memo file. */
export const distillTaste = (db: DB, call: CallClaude = callClaude): DistillResult => {
  const signals = collectSignals(db);
  if (signals.total < MIN_SIGNALS) {
    return {
      distilled: false,
      message: `taste distillation skipped: only ${signals.total} signal(s) in the window`,
    };
  }
  const model = storyModels().writer;
  const memo = extractResultText(call(buildDistillPrompt(signals), { model }))
    .trim()
    .split("\n")
    .slice(0, MEMO_MAX_LINES)
    .join("\n");
  const file = tasteMemoPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${memo}\n`);
  return {
    distilled: true,
    message: `taste memo distilled from ${signals.total} signal(s) → ${file} (model=${model})`,
  };
};

/** Weekly cadence guard: distill only when the memo is missing or stale. */
export const maybeDistillTaste = (db: DB, call: CallClaude = callClaude): DistillResult => {
  try {
    const age = Date.now() - fs.statSync(tasteMemoPath()).mtimeMs;
    if (age < DISTILL_EVERY_DAYS * 86400 * 1000) {
      return { distilled: false, message: "taste memo is fresh — skipping distillation" };
    }
  } catch {
    // no memo yet — distill if there's signal
  }
  return distillTaste(db, call);
};

/**
 * Retention: rejected drafts older than EPITAPH_AFTER_DAYS are compressed to
 * a one-line epitaph (title, lane, tags, reason, one sentence of text) and
 * their pages dropped. Runs alongside the weekly distillation.
 */
export const compressRejectedStories = (db: DB): number => {
  const cutoff = new Date(Date.now() - EPITAPH_AFTER_DAYS * 86400 * 1000);
  const rows = db
    .select()
    .from(stories)
    .where(
      and(eq(stories.status, "rejected"), lt(stories.createdAt, cutoff), sql`epitaph IS NULL`),
    )
    .all();
  for (const s of rows) {
    const firstPage = db
      .select({ text: storyPages.text })
      .from(storyPages)
      .where(eq(storyPages.storyId, s.id))
      .orderBy(storyPages.pageIndex)
      .get();
    const firstLine = (firstPage?.text ?? "").split(/[.!?]/)[0].trim();
    const epitaph = `"${s.title ?? "untitled"}" [${s.lane ?? "?"}] tags: ${(s.tags ?? []).join(", ")} — rejected (${s.rejectReason ?? "no reason"})${firstLine ? `; opened: "${firstLine}."` : ""}`;
    db.transaction((tx) => {
      tx.update(stories).set({ epitaph }).where(eq(stories.id, s.id)).run();
      tx.delete(storyPages).where(eq(storyPages.storyId, s.id)).run();
    });
  }
  return rows.length;
};
