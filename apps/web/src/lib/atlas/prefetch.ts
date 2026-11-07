/**
 * Likely-next prefetch — when the reader opens a node, draft the missing
 * eli10 and one-pager rungs of the next few unvisited nodes in picker order
 * (children of the node, then its siblings, then the next branch), so the
 * page they click next is already there. Spawned detached by the visit route
 * through runner.spawnNodePrefetch → `job:atlas prefetch --node <id>`.
 *
 * Generation follows the reader's clicks; it is never a crawl-everything job.
 * Deep dives are explicitly NOT prefetched — that is the owner's call: they
 * are the costly, judged rung and stay strictly on demand.
 *
 * The drafting row is the claim. A rung that is `drafting` and not stale is
 * someone else's work (a click, a preload shard, an earlier prefetch) and is
 * skipped, so rapid clicks and overlapping runs skip each other's work; stale
 * reaping is unchanged and a stale `drafting` row is simply redrafted. The
 * check-then-mark is not atomic (markRungDrafting), so a sub-millisecond
 * photo finish between two detached runs can still double-draft or trip the
 * unique index — each target is wrapped in its own try/catch so one such
 * collision never sinks the rest of the run.
 */
import { asc, eq } from "drizzle-orm";
import type { DB } from "../../db/client";
import { atlasNodes, type AtlasRungLevel } from "../../db/schema";
import { householdMemory, toFrontierNodes } from "./frontier";
import { maybeNotifyMapReady, type SendEmailFn } from "./preload";
import type { AtlasLlm } from "./llm";
import { frontierCandidates, type FrontierNode } from "./picker";
import { ensureRung, rungFor } from "./rungs";
import { RUNG_STALE_MS, isStale } from "./runner";
import type { FetchLike } from "./verify";

/** The next 2-3 unvisited nodes; the constant is 3. */
export const PREFETCH_COUNT = 3;

/** One-pager first: the eli10 is written from it. Never "deepdive". */
const PREFETCH_LEVELS: readonly AtlasRungLevel[] = ["onepager", "eli10"];

/**
 * The node ids to prefetch from `anchorId`: the picker's frontier ordering
 * (already excludes visited, skipped, and skipped-parent nodes), first `limit`.
 */
export const prefetchTargets = (
  nodes: FrontierNode[],
  anchorId: number,
  limit = PREFETCH_COUNT,
): number[] =>
  frontierCandidates(nodes, anchorId)
    .slice(0, limit)
    .map((c) => c.nodeId);

export type PrefetchDeps = {
  llm?: AtlasLlm;
  fetchImpl?: FetchLike;
  send?: SendEmailFn;
  log?: (msg: string) => void;
  now?: Date;
};

export type PrefetchResult = { drafted: number; skipped: number; failed: number };

export const prefetchFromNode = async (
  db: DB,
  nodeId: number,
  deps: PrefetchDeps = {},
): Promise<PrefetchResult> => {
  const log = deps.log ?? console.log;
  const result: PrefetchResult = { drafted: 0, skipped: 0, failed: 0 };

  const node = db.select().from(atlasNodes).where(eq(atlasNodes.id, nodeId)).get();
  if (!node) {
    log(`prefetch: node #${nodeId} not found — nothing to do`);
    return result;
  }

  const rows = db
    .select()
    .from(atlasNodes)
    .where(eq(atlasNodes.mapId, node.mapId))
    .orderBy(asc(atlasNodes.id))
    .all();
  const targets = prefetchTargets(toFrontierNodes(rows, householdMemory(db, rows)), node.id);
  const titles = new Map(rows.map((r) => [r.id, r.title]));
  log(`prefetch from node #${node.id} "${node.title}": ${targets.length} target(s)`);

  // The opened node itself may be missing its eli10 (a click job drafted only
  // the one-pager, or the map predates eli10-at-creation and the backfill has
  // not reached it) — the reader is on that page, so fill it first. The
  // one-pager itself is the node page's own job, never prefetch's.
  const work: { nodeId: number; levels: readonly AtlasRungLevel[] }[] = [
    { nodeId: node.id, levels: ["eli10"] },
    ...targets.map((t) => ({ nodeId: t, levels: PREFETCH_LEVELS })),
  ];

  for (const { nodeId: targetId, levels } of work) {
    const label = `node #${targetId} "${titles.get(targetId)}"`;
    for (const level of levels) {
      // An eli10 is written from its one-pager: if the one-pager is not ready
      // here (it just failed, or another run holds its claim) leave the eli10
      // for a later visit, rather than ensureRung redrafting under that claim.
      if (level === "eli10" && rungFor(db, targetId, "onepager")?.status !== "ready") {
        log(`${label}: eli10 skipped — one-pager not ready`);
        result.skipped += 1;
        continue;
      }
      const existing = rungFor(db, targetId, level);
      if (
        existing?.status === "ready" ||
        (existing?.status === "drafting" && !isStale(existing.startedAt, RUNG_STALE_MS, deps.now))
      ) {
        log(`${label}: ${level} ${existing.status} — skipped`);
        result.skipped += 1;
        continue;
      }
      try {
        const res = await ensureRung(db, targetId, level, {
          llm: deps.llm,
          fetchImpl: deps.fetchImpl,
          log,
        });
        if (!res.ok) result.failed += 1;
        else if (res.fresh) result.drafted += 1;
        else result.skipped += 1;
      } catch (err) {
        // e.g. the unique-index race when another run claimed this rung in the
        // same instant — that run owns it now; carry on with the other targets.
        log(`${label}: ${level} errored (${err instanceof Error ? err.message : err}) — skipped`);
        result.failed += 1;
      }
    }
  }

  // This run may have settled the map's last missing rung (above all during a
  // backfill), so give the "map is ready" claim the same chance a preload
  // shard gets. Idempotent: the notified_at guard means at most one email ever.
  await maybeNotifyMapReady(db, node.mapId, { send: deps.send, log, now: deps.now });

  log(
    `prefetch from node #${node.id} done: ${result.drafted} drafted, ${result.skipped} skipped, ${result.failed} failed`,
  );
  return result;
};
