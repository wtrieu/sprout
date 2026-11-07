/**
 * How Atlas model work gets started from the web process: a detached
 * `pnpm run job:atlas …` (scripts/atlas.ts), the same pattern as
 * POST /api/stories/express. The status rows are what the UI polls, so this
 * module also owns the "drafting for too long" rule that turns a run which
 * died silently (spawn failure, killed process) into a visible failure.
 *
 * Node-only (child_process) — import from API routes and scripts, never
 * from client components.
 */
import { spawn } from "node:child_process";
import { and, eq, lt, sql } from "drizzle-orm";
import type { DB } from "../../db/client";
import { atlasMaps, atlasRungs } from "../../db/schema";

/** A map draft is ~10–15 sequential model calls. */
export const MAP_STALE_MS = 20 * 60 * 1000;
/** A rung is write + judge + link verification. */
export const RUNG_STALE_MS = 10 * 60 * 1000;

export const isStale = (since: Date | null | undefined, ms: number, now = new Date()): boolean =>
  !since || now.getTime() - since.getTime() > ms;

export const spawnAtlasJob = (args: string[]): void => {
  const child = spawn("pnpm", ["run", "job:atlas", ...args], {
    cwd: process.cwd(), // apps/web in dev and under launchd (pnpm --filter)
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
    env: process.env,
  });
  child.unref();
};

/** Spawn the weekly frontier note (the manual "send this week's note" button). */
export const spawnFrontierNote = (force = false): void =>
  spawnAtlasJob(["note", ...(force ? ["--force"] : [])]);

/** How many detached preload shards to run (one rung at a time each). */
export const preloadWorkers = (): number => {
  const n = Number(process.env.ATLAS_PRELOAD_WORKERS ?? 3);
  return Number.isInteger(n) && n >= 1 && n <= 8 ? n : 3;
};

/**
 * Spawn the detached preload shards for a map (after draft-map, and from the
 * "Prepare the rest" button). Each shard takes the nodes with
 * `id % shards === shard` and the last one standing sends the ready email.
 */
export const spawnPreloadShards = (mapId: number, shards = preloadWorkers()): number => {
  for (let shard = 0; shard < shards; shard++) {
    spawnAtlasJob([
      "preload",
      "--map",
      String(mapId),
      "--shard",
      String(shard),
      "--shards",
      String(shards),
    ]);
  }
  return shards;
};

/**
 * Spawn the detached likely-next prefetch for a node the reader just opened
 * (called by the visit route). Drafts the missing eli10 + one-pager rungs of
 * the next few unvisited nodes; never the deep dive.
 */
export const spawnNodePrefetch = (nodeId: number): void =>
  spawnAtlasJob(["prefetch", "--node", String(nodeId)]);

const STALE_MESSAGE = "No result came back in time — the background run may have died. Try again.";

export type MapQueueDeps = {
  /** Start the detached draft of a claimed map (default: `job:atlas draft-map`). */
  spawn?: (mapId: number) => void;
};

const spawnMapDraft = (mapId: number): void => spawnAtlasJob(["draft-map", "--map", String(mapId)]);

/**
 * Promote the oldest `queued` map (by createdAt, then id) to `drafting` and
 * start its draft. Drafts are strictly sequential, so this is a no-op while
 * any map is `drafting`.
 *
 * The flip is ONE `UPDATE … WHERE` statement carrying both the "still queued,
 * and it is the oldest" and the "nothing is drafting" conditions, and we spawn
 * only if a row actually changed. SQLite serialises writers, so two finishing
 * shards, a reaper and a POST can race here and exactly one wins the claim
 * (the others see zero rows changed). createdAt is reset to now: it is the
 * "drafting since" clock the stale reaper reads, and a map that waited in the
 * queue must not be born stale.
 *
 * Returns the promoted map id, or null.
 */
export const promoteNextQueuedMap = (
  db: DB,
  deps: MapQueueDeps & { now?: Date } = {},
): number | null => {
  const claimed = db
    .update(atlasMaps)
    .set({ status: "drafting", error: null, createdAt: deps.now ?? new Date() })
    .where(
      sql`status = 'queued'
        AND id = (SELECT id FROM atlas_maps WHERE status = 'queued' ORDER BY created_at ASC, id ASC LIMIT 1)
        AND NOT EXISTS (SELECT 1 FROM atlas_maps WHERE status = 'drafting')`,
    )
    .returning({ id: atlasMaps.id })
    .all();
  const id = claimed[0]?.id;
  if (id === undefined) return null;
  (deps.spawn ?? spawnMapDraft)(id);
  return id;
};

/**
 * The front door for a new map: the row is inserted `queued` and then run
 * through the same claim as every other promotion, so it starts at once when
 * nothing is drafting and waits its turn when something is. Returns the row as
 * it stands after the claim (`drafting` or `queued`).
 */
export const enqueueMapDraft = (
  db: DB,
  input: { title: string; brief: string | null },
  deps: MapQueueDeps & { now?: Date } = {},
) => {
  // A crashed draft must not make the new map wait forever.
  reapStaleMaps(db, deps.now, deps);
  const row = db
    .insert(atlasMaps)
    .values({ title: input.title, brief: input.brief, status: "queued" })
    .returning({ id: atlasMaps.id })
    .get();
  promoteNextQueuedMap(db, deps);
  return db.select().from(atlasMaps).where(eq(atlasMaps.id, row.id)).get()!;
};

/**
 * Flip maps that have been `drafting` past the deadline to `failed`, then
 * (always) try to promote the next queued map so the queue cannot deadlock
 * behind a crashed draft. `queued` rows are never reaped: they are not
 * running, and createdAt says nothing about how long they have been working.
 */
export const reapStaleMaps = (db: DB, now = new Date(), deps: MapQueueDeps = {}): number => {
  const reaped = db
    .update(atlasMaps)
    .set({ status: "failed", error: STALE_MESSAGE })
    .where(
      and(eq(atlasMaps.status, "drafting"), lt(atlasMaps.createdAt, new Date(now.getTime() - MAP_STALE_MS))),
    )
    .returning({ id: atlasMaps.id })
    .all().length;
  // Unconditional, not just when something was reaped: a draft job can die
  // after the map went `ready` but before its own finally promoted (the window
  // includes onReady's seed placement), leaving queued rows and nothing
  // drafting with nothing stale to reap. The claim is atomic and a no-op while
  // a map is drafting or the queue is empty, so every poll can self-heal that.
  promoteNextQueuedMap(db, { ...deps, now });
  return reaped;
};

/** Flip rungs that have been `drafting` past the deadline to `failed`. */
export const reapStaleRungs = (db: DB, now = new Date()): number =>
  db
    .update(atlasRungs)
    .set({ status: "failed", error: STALE_MESSAGE })
    .where(
      and(
        eq(atlasRungs.status, "drafting"),
        lt(atlasRungs.startedAt, new Date(now.getTime() - RUNG_STALE_MS)),
      ),
    )
    .returning({ id: atlasRungs.id })
    .all().length;
