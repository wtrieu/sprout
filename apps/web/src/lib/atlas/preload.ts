/**
 * Preload — every one-pager (with its quiz) drafted as soon as a map exists,
 * so from then on every node opens instantly. Eli10 and deep dive stay on
 * demand.
 *
 * callClaude is spawnSync, so one process is serial; the web process spawns
 * ATLAS_PRELOAD_WORKERS detached shards (runner.spawnPreloadShards) and each
 * shard runs preloadMap over the nodes with `id % shards === shard`. Branch
 * nodes are nodes like any other — they keep their one-pagers.
 *
 * The "map is ready" email is sent exactly once: the shard that finds every
 * node's one-pager ready-or-failed (and nothing still drafting) atomically
 * claims `atlas_maps.notified_at` — the UPDATE that returns a row sends, so
 * two shards finishing together cannot send twice.
 */
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { DB } from "../../db/client";
import { atlasMaps, atlasNodes, atlasRungs } from "../../db/schema";
import { sendEmail } from "../email";
import { renderMapReadyEmail, type MapReadyStart } from "./email";
import { atlasModels, cliLlm, type AtlasLlm } from "./llm";
import {
  QuizSchema,
  buildQuizPrompt,
  contextBlock,
  ensureRung,
  loadNodeContext,
  rungFor,
  validateQuiz,
  verifyAndStoreImages,
} from "./rungs";
import { RUNG_STALE_MS, isStale } from "./runner";
import type { FetchLike } from "./verify";
import { VisualsBackfillSchema, buildVisualsPrompt, insertMarkers, validateVisuals } from "./visuals";

export type SendEmailFn = (input: {
  subject: string;
  html: string;
}) => Promise<{ sent: boolean; id: string | null }>;

export type PreloadDeps = {
  /** This worker's shard (0-based) and the total shard count. */
  shard?: number;
  shards?: number;
  llm?: AtlasLlm;
  fetchImpl?: FetchLike;
  send?: SendEmailFn;
  log?: (msg: string) => void;
  now?: Date;
};

export type PreloadResult = {
  drafted: number;
  skipped: number;
  failed: number;
  quizzes: number;
  visuals: number;
  notified: boolean;
};

type NodeRow = typeof atlasNodes.$inferSelect;

/** First unvisited child of the first three branches, each with its hook. */
export const suggestedStarts = (
  nodes: NodeRow[],
  hookFor: (nodeId: number) => string | null,
): MapReadyStart[] => {
  const byPosition = (a: NodeRow, b: NodeRow) => a.position - b.position || a.id - b.id;
  const branches = nodes.filter((n) => n.parentId === null).sort(byPosition);
  const starts: MapReadyStart[] = [];
  for (const b of branches) {
    if (starts.length >= 3) break;
    const child = nodes
      .filter((n) => n.parentId === b.id && !n.visitedAt)
      .sort(byPosition)[0];
    if (child) starts.push({ nodeId: child.id, title: child.title, hook: hookFor(child.id) });
  }
  return starts;
};

export const preloadMap = async (
  db: DB,
  mapId: number,
  deps: PreloadDeps = {},
): Promise<PreloadResult> => {
  const log = deps.log ?? console.log;
  const shards = deps.shards ?? 1;
  const shard = deps.shard ?? 0;
  if (!Number.isInteger(shards) || shards < 1 || !Number.isInteger(shard) || shard < 0 || shard >= shards) {
    throw new Error(`bad shard arithmetic: shard ${shard} of ${shards}`);
  }
  const llm = deps.llm ?? cliLlm;
  const map = db.select().from(atlasMaps).where(eq(atlasMaps.id, mapId)).get();
  if (!map) throw new Error(`map #${mapId} not found`);

  const nodes = db
    .select()
    .from(atlasNodes)
    .where(eq(atlasNodes.mapId, mapId))
    .orderBy(asc(atlasNodes.id))
    .all();
  const mine = nodes.filter((n) => n.id % shards === shard);
  log(`preload map #${mapId} shard ${shard}/${shards}: ${mine.length} of ${nodes.length} nodes`);

  let drafted = 0;
  let skipped = 0;
  let failed = 0;

  for (const node of mine) {
    const existing = rungFor(db, node.id, "onepager");
    if (existing?.status === "drafting" && !isStale(existing.startedAt, RUNG_STALE_MS, deps.now)) {
      log(`node #${node.id} "${node.title}": already drafting — skipped`);
      skipped += 1;
      continue;
    }
    const res = await ensureRung(db, node.id, "onepager", {
      llm: deps.llm,
      fetchImpl: deps.fetchImpl,
      log,
    });
    if (!res.ok) failed += 1;
    else if (res.fresh) drafted += 1;
    else skipped += 1;
  }

  // Quiz backfill for maps drafted before PR-A: one quiz-only call per ready
  // one-pager whose quiz_json is still null. A failure here never fails the
  // rung — the row stays null and the next preload run retries it.
  let quizzes = 0;
  const models = atlasModels();
  for (const node of mine) {
    const rung = rungFor(db, node.id, "onepager");
    if (rung?.status !== "ready" || rung.quizJson !== null || !rung.bodyMd) continue;
    const ctx = loadNodeContext(db, node.id);
    if (!ctx) continue;
    try {
      const { quiz } = llm(
        buildQuizPrompt({ context: contextBlock(ctx), onepagerMd: rung.bodyMd }),
        QuizSchema,
        { model: models.onepager, label: "quiz backfill" },
      );
      const problems = validateQuiz(quiz);
      if (problems.length > 0) throw new Error(problems.join("; "));
      db.update(atlasRungs)
        .set({ quizJson: JSON.stringify(quiz) })
        .where(eq(atlasRungs.id, rung.id))
        .run();
      quizzes += 1;
    } catch (err) {
      log(
        `quiz backfill for node #${node.id} failed (${err instanceof Error ? err.message : err}) — left null`,
      );
    }
  }

  // Visuals backfill for rungs written before PR-B: one visuals-only call per
  // ready one-pager whose visuals_json is still null. The model anchors each
  // visual to a "###" heading and code inserts the marker — the prose itself
  // is never rewritten. A failure leaves the row null for the next run;
  // success stores at least "[]" so a page that wants no visuals is never
  // asked again.
  let visualsBackfilled = 0;
  const fetchImpl: FetchLike = deps.fetchImpl ?? ((url, init) => fetch(url, init));
  for (const node of mine) {
    const rung = rungFor(db, node.id, "onepager");
    if (rung?.status !== "ready" || rung.visualsJson !== null || !rung.bodyMd) continue;
    const ctx = loadNodeContext(db, node.id);
    if (!ctx) continue;
    try {
      const out = llm(
        buildVisualsPrompt({ context: contextBlock(ctx), bodyMd: rung.bodyMd, level: "onepager" }),
        VisualsBackfillSchema,
        { model: models.onepager, label: "visuals backfill" },
      );
      const visuals = out.visuals ?? [];
      const images = out.images ?? [];
      let bodyMd = rung.bodyMd;
      if (visuals.length > 0 || images.length > 0) {
        bodyMd = insertMarkers(bodyMd, [
          ...visuals.map((v) => ({
            type: "visual" as const,
            slug: v.slug,
            afterHeading: v.after_heading ?? null,
          })),
          ...images.map((p) => ({
            type: "image" as const,
            slug: p.slug,
            afterHeading: p.after_heading ?? null,
          })),
        ]);
        const problems = validateVisuals("onepager", bodyMd, visuals, images);
        if (problems.length > 0) throw new Error(problems.join("; "));
      }
      if (images.length > 0) {
        await verifyAndStoreImages(db, node.id, "backfill", images, fetchImpl);
      }
      db.update(atlasRungs)
        .set({ bodyMd, visualsJson: JSON.stringify(visuals) })
        .where(eq(atlasRungs.id, rung.id))
        .run();
      visualsBackfilled += 1;
    } catch (err) {
      log(
        `visuals backfill for node #${node.id} failed (${err instanceof Error ? err.message : err}) — left null`,
      );
    }
  }

  // This shard is done. If the whole map is done — no rung of the map still
  // drafting, every node's one-pager ready-or-failed — claim the notification.
  const nodeIds = nodes.map((n) => n.id);
  const rungRows = nodeIds.length
    ? db.select().from(atlasRungs).where(inArray(atlasRungs.nodeId, nodeIds)).all()
    : [];
  const anyDrafting = rungRows.some((r) => r.status === "drafting");
  const onepagers = new Map(rungRows.filter((r) => r.level === "onepager").map((r) => [r.nodeId, r]));
  const complete =
    nodes.length > 0 &&
    !anyDrafting &&
    nodes.every((n) => {
      const s = onepagers.get(n.id)?.status;
      return s === "ready" || s === "failed";
    });

  let notified = false;
  if (complete) {
    const claimed = db
      .update(atlasMaps)
      .set({ notifiedAt: deps.now ?? new Date() })
      .where(and(eq(atlasMaps.id, mapId), isNull(atlasMaps.notifiedAt)))
      .returning({ id: atlasMaps.id })
      .get();
    if (claimed) {
      const readyCount = nodes.filter((n) => onepagers.get(n.id)?.status === "ready").length;
      const email = renderMapReadyEmail({
        map: { id: map.id, title: map.title, blurb: map.blurb },
        branchCount: nodes.filter((n) => n.parentId === null).length,
        nodeCount: nodes.length,
        readyCount,
        failedCount: nodes.length - readyCount,
        starts: suggestedStarts(nodes, (id) => onepagers.get(id)?.hook ?? null),
        baseUrl: process.env.SPROUT_BASE_URL ?? "http://localhost:3100",
      });
      const send = deps.send ?? sendEmail;
      await send(email);
      notified = true;
      log(`map #${mapId} fully preloaded — notification sent by shard ${shard}`);
    }
  }

  log(
    `preload shard ${shard}/${shards} done: ${drafted} drafted, ${skipped} skipped, ${failed} failed, ${quizzes} quizzes backfilled, ${visualsBackfilled} visuals backfilled${notified ? ", email sent" : ""}`,
  );
  return { drafted, skipped, failed, quizzes, visuals: visualsBackfilled, notified };
};
