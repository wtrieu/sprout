/**
 * Nightly story engine (premise-first). Runs headless `claude -p` on the Max
 * subscription (ANTHROPIC_API_KEY stripped from the child env — never metered
 * API billing). Three stages:
 *
 *   A. One frontier-model call proposes ~8 premises across genre lanes; code
 *      ranks them (diversity + lesson dial + north-star shares) and they land
 *      in the premise inbox for the parent to greenlight or pass.
 *   B. Greenlit premises are written immediately by the detached
 *      job:write-book spawn; this script also (re)writes greenlit leftovers
 *      and, as a backstop, auto-picks diverse winners from premises that sat
 *      unreviewed past `premiseAutoPickHours`.
 *   C. Every book passes an independent editor-judge (see
 *      lib/stories/writeBook.ts) before it becomes a reviewable draft.
 *
 * Run via: pnpm --filter web run job:stories   (launchd: com.sprout.stories)
 */
import "./env";
import { sql } from "drizzle-orm";
import { db } from "../apps/web/src/db/client";
import { children, premises } from "../apps/web/src/db/schema";
import { formatAge, ageInMonths } from "../apps/web/src/lib/age";
import { getSetting, resolveStoryAgeMonths } from "../apps/web/src/lib/settings";
import { ageBand } from "../apps/web/src/lib/skills/storyText";
import {
  callClaudeForJson,
  storyModels,
} from "../apps/web/src/lib/stories/claudeCli";
import {
  MAX_PENDING_PREMISES,
  PREMISES_PER_BATCH,
  PremiseBatchSchema,
  buildPremisePrompt,
  expireStalePremises,
  normalizePremise,
  pendingPremiseCount,
  rankPremises,
  recentBookRows,
  recentPickedPremises,
  selectPremises,
  stalePremiseRows,
  storePremises,
  unwrittenGreenlitRows,
  type SelectionContext,
} from "../apps/web/src/lib/stories/premises";
import { writeBookForPremise } from "../apps/web/src/lib/stories/writeBook";
import {
  activeNorthStars,
  decayInterests,
  northStarShares,
  sampleInterests,
} from "../apps/web/src/lib/stories/interests";
import {
  sampleSeedSuggestions,
  seedKeys,
  seedSuggestion,
} from "../apps/web/src/lib/stories/seeds";
import {
  compressRejectedStories,
  maybeDistillTaste,
  readTasteMemo,
} from "../apps/web/src/lib/stories/taste";
import { worldBrief } from "../apps/web/src/lib/stories/worlds";

/** The child's milestone frontier, as short lines for the premise prompt. */
const milestoneFrontier = (months: number): string[] => {
  const bucket = db.get<{ age: number } | undefined>(
    sql`SELECT MAX(age_months) as age FROM milestones WHERE age_months <= ${months}`,
  );
  const next = db.get<{ age: number } | undefined>(
    sql`SELECT MIN(age_months) as age FROM milestones WHERE age_months > ${months}`,
  );
  return db
    .all<{ domain: string; description: string }>(
      sql`SELECT domain, description FROM milestones
          WHERE age_months IN (${bucket?.age ?? months}, ${next?.age ?? months})
          ORDER BY RANDOM() LIMIT 6`,
    )
    .map((m) => `(${m.domain}) ${m.description}`);
};

const selectionContext = (): SelectionContext => ({
  recentBooks: recentBookRows(db).map((b) => ({ lane: b.lane, tags: b.tags ?? [] })),
  recentPicks: recentPickedPremises(db),
  northStars: northStarShares(db),
});

const main = async () => {
  console.log(`story engine starting ${new Date().toISOString()}`);
  const child = db.select().from(children).limit(1).get();
  if (!child) {
    console.log("no child profile — skipping");
    return;
  }
  const models = storyModels();
  console.log(`models: writer=${models.writer} judge=${models.judge}`);

  const expired = expireStalePremises(db);
  if (expired > 0) console.log(`expired ${expired} stale premise(s) (auto-pass)`);
  const decayed = decayInterests(db);
  if (decayed > 0) console.log(`decayed ${decayed} interest(s)`);

  // Weekly taste loop: distill the editor's memo when stale, and compress
  // rejected drafts past retention to epitaphs.
  try {
    console.log(maybeDistillTaste(db).message);
  } catch (err) {
    console.error(`taste distillation failed: ${err instanceof Error ? err.message : err}`);
  }
  const compressed = compressRejectedStories(db);
  if (compressed > 0) console.log(`compressed ${compressed} rejected draft(s) to epitaphs`);

  // --- stage A: propose tonight's premises (skip while the inbox is full) ---
  const pending = pendingPremiseCount(db);
  if (pending >= MAX_PENDING_PREMISES) {
    console.log(`${pending} premises already waiting for review — skipping stage A`);
  } else {
    const targetMonths = resolveStoryAgeMonths(db);
    const band = ageBand(targetMonths);
    const pendingTitles = db
      .all<{ title: string }>(sql`SELECT title FROM premises WHERE status = 'proposed'`)
      .map((r) => r.title);
    const prompt = buildPremisePrompt({
      childName: child.name,
      ageText: formatAge(targetMonths),
      band,
      batchSize: PREMISES_PER_BATCH,
      recentBooks: recentBookRows(db),
      pendingTitles,
      northStars: activeNorthStars(db).map((n) => ({ label: n.label, brief: n.brief })),
      interests: sampleInterests(db).map((i) => ({ label: i.label, brief: i.brief })),
      seedSuggestions: sampleSeedSuggestions(northStarShares(db)).map(seedSuggestion),
      milestoneFrontier: milestoneFrontier(ageInMonths(child.dob)),
      tasteMemo: readTasteMemo(),
      worldBrief: worldBrief(),
    });
    try {
      console.log(`stage A: proposing ${PREMISES_PER_BATCH} premises model=${models.writer}`);
      const raw = callClaudeForJson(prompt, { model: models.writer });
      const batch = PremiseBatchSchema.parse(raw).premises.map((p) =>
        normalizePremise(p, band, seedKeys),
      );
      const ranked = rankPremises(batch, selectionContext());
      storePremises(db, child.id, batch, ranked);
      console.log(
        `stage A: stored ${batch.length} premises across lanes [${[...new Set(batch.map((p) => p.lane))].join(", ")}], ${batch.filter((p) => p.lesson !== "none").length} with a lesson`,
      );
    } catch (err) {
      console.error(`stage A failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  // --- book budget: don't pile drafts on top of unreviewed drafts ----------
  const candidatesPerDay = getSetting(db, "storyCandidatesPerDay");
  const maxPendingDrafts = Math.max(4, candidatesPerDay * 2);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const draftsToday =
    db.get<{ n: number }>(
      sql`SELECT COUNT(*) as n FROM stories WHERE status = 'draft' AND created_at >= ${Math.floor(todayStart.getTime() / 1000)}`,
    )?.n ?? 0;
  const pendingDrafts =
    db.get<{ n: number }>(sql`SELECT COUNT(*) as n FROM stories WHERE status = 'draft'`)?.n ?? 0;
  let budget = Math.min(candidatesPerDay - draftsToday, maxPendingDrafts - pendingDrafts);

  // --- crash recovery: greenlit premises whose detached write never landed --
  for (const row of unwrittenGreenlitRows(db)) {
    if (budget <= 0) break;
    console.log(`retrying greenlit premise #${row.id} "${row.title}"`);
    try {
      if (writeBookForPremise(db, row).ok) budget -= 1;
    } catch (err) {
      console.error(`premise #${row.id} failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  // --- auto-pick fallback: premises unreviewed past the window -------------
  const stale = stalePremiseRows(db, getSetting(db, "premiseAutoPickHours"));
  if (stale.length === 0 || budget <= 0) {
    console.log(
      `auto-pick: ${stale.length} stale premise(s), budget ${Math.max(0, budget)} — nothing to write`,
    );
    return;
  }
  const winners = selectPremises(
    stale.map((row) => ({ ...row, tags: row.tags ?? [] })),
    budget,
    selectionContext(),
  );
  console.log(`auto-pick: writing ${winners.length}/${stale.length} stale premise(s)`);
  for (const winner of winners) {
    db.update(premises)
      .set({ status: "auto_picked", decidedAt: new Date() })
      .where(sql`id = ${winner.id}`)
      .run();
    try {
      const result = writeBookForPremise(db, { ...winner, status: "auto_picked" });
      if (!result.ok) console.error(`premise #${winner.id} rejected: ${result.reason}`);
    } catch (err) {
      console.error(`premise #${winner.id} failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log("story engine done");
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
