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
import { and, eq, lt } from "drizzle-orm";
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

const STALE_MESSAGE = "No result came back in time — the background run may have died. Try again.";

/** Flip maps that have been `drafting` past the deadline to `failed`. */
export const reapStaleMaps = (db: DB, now = new Date()): number =>
  db
    .update(atlasMaps)
    .set({ status: "failed", error: STALE_MESSAGE })
    .where(
      and(eq(atlasMaps.status, "drafting"), lt(atlasMaps.createdAt, new Date(now.getTime() - MAP_STALE_MS))),
    )
    .returning({ id: atlasMaps.id })
    .all().length;

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
