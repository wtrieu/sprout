/**
 * Express story: the on-demand "Write a book now" flow. One run takes an
 * optional parent request ("a book about excavators"), commissions a small
 * premise batch steered by it (EXPRESS_BATCH_SIZE — the ranker needs a real
 * choice), keeps ONLY the winner as a greenlit premise (parent-initiated =
 * greenlight semantics; runners-up are scaffolding and are never stored),
 * and writes the book immediately through the full stage B+C pipeline.
 *
 * The premise inbox is untouched: express books never consume pending
 * premises, and never add clutter to them.
 *
 * Run via: pnpm --filter web run job:express-story [-- --topic "excavators"]
 * Spawned detached by POST /api/stories/express.
 */
import "./env";
import { sql } from "drizzle-orm";
import { db } from "../apps/web/src/db/client";
import { children, premises } from "../apps/web/src/db/schema";
import { formatAge } from "../apps/web/src/lib/age";
import { resolveStoryAgeMonths } from "../apps/web/src/lib/settings";
import { ageBand } from "../apps/web/src/lib/skills/storyText";
import { callClaudeForJson, storyModels } from "../apps/web/src/lib/stories/claudeCli";
import {
  EXPRESS_BATCH_SIZE,
  PremiseBatchSchema,
  buildPremisePrompt,
  normalizePremise,
  recentBookRows,
  recentPickedPremises,
  selectPremises,
} from "../apps/web/src/lib/stories/premises";
import { writeBookForPremise } from "../apps/web/src/lib/stories/writeBook";
import {
  activeNorthStars,
  northStarShares,
  sampleInterests,
} from "../apps/web/src/lib/stories/interests";
import {
  sampleSeedSuggestions,
  seedKeys,
  seedSuggestion,
} from "../apps/web/src/lib/stories/seeds";
import { readTasteMemo } from "../apps/web/src/lib/stories/taste";
import { worldBrief } from "../apps/web/src/lib/stories/worlds";
import { ENGINE_VERSION } from "../apps/web/src/lib/stories/engine";

const args = process.argv.slice(2);
const topicIdx = args.indexOf("--topic");
const topic = topicIdx !== -1 ? args[topicIdx + 1]?.trim() : undefined;

const main = async () => {
  console.log(
    `express story starting ${new Date().toISOString()}${topic ? ` — request: "${topic}"` : ""}`,
  );
  const child = db.select().from(children).limit(1).get();
  if (!child) {
    console.error("no child profile — nothing to do");
    process.exit(1);
  }
  const models = storyModels();
  const targetMonths = resolveStoryAgeMonths(db);
  const band = ageBand(targetMonths);
  const pendingTitles = db
    .all<{ title: string }>(sql`SELECT title FROM premises WHERE status = 'proposed'`)
    .map((r) => r.title);

  const prompt = buildPremisePrompt({
    childName: child.name,
    ageText: formatAge(targetMonths),
    band,
    batchSize: EXPRESS_BATCH_SIZE,
    recentBooks: recentBookRows(db),
    pendingTitles,
    northStars: activeNorthStars(db).map((n) => ({ label: n.label, brief: n.brief })),
    interests: sampleInterests(db).map((i) => ({ label: i.label, brief: i.brief })),
    seedSuggestions: sampleSeedSuggestions(northStarShares(db)).map(seedSuggestion),
    milestoneFrontier: [],
    tasteMemo: readTasteMemo(),
    worldBrief: worldBrief(),
    request: topic || undefined,
  });

  console.log(`stage A (express): proposing ${EXPRESS_BATCH_SIZE} candidates model=${models.writer}`);
  const raw = callClaudeForJson(prompt, { model: models.writer });
  const batch = PremiseBatchSchema.parse(raw).premises.map((p) =>
    normalizePremise(p, band, seedKeys),
  );
  const [winner] = selectPremises(batch, 1, {
    recentBooks: recentBookRows(db).map((b) => ({ lane: b.lane, tags: b.tags ?? [] })),
    recentPicks: recentPickedPremises(db),
    northStars: northStarShares(db),
  });
  if (!winner) {
    console.error("no usable premise came back");
    process.exit(1);
  }
  console.log(`winner: "${winner.title}" [${winner.lane}] — ${winner.pitch}`);

  const row = db
    .insert(premises)
    .values({
      childId: child.id,
      title: winner.title,
      lane: winner.lane,
      pitch: winner.pitch,
      tags: winner.tags,
      lesson: winner.lesson,
      lessonNote: winner.lessonNote ?? null,
      seedRef: winner.seedRef ?? null,
      worldRef: winner.worldRef ?? null,
      form: winner.form ?? null,
      lengthPages: winner.lengthPages,
      whyForJun: winner.whyForJun ?? null,
      score: 0,
      engineVersion: ENGINE_VERSION,
      status: "greenlit",
      decidedAt: new Date(),
    })
    .returning()
    .get();

  const result = writeBookForPremise(db, row);
  if (result.ok) {
    console.log(`express story done → draft #${result.storyId} "${result.title}"`);
  } else {
    console.error(`express story failed: ${result.reason}`);
    process.exit(2);
  }
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
