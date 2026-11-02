/**
 * Atlas runner. Every piece of model work for the Atlas module runs here,
 * detached from the web process (spawned by the API routes, or run by hand),
 * on the headless `claude -p` path — Max subscription; ANTHROPIC_API_KEY is
 * stripped inside lib/stories/claudeCli.ts so a run can never bill the API.
 *
 *   pnpm --filter web run job:atlas draft-map --map <id>
 *   pnpm --filter web run job:atlas rung --node <id> --level <eli10|onepager|deepdive> [--force]
 *   pnpm --filter web run job:atlas preload --map <id> [--shard k --shards n]
 *   pnpm --filter web run job:atlas engine [--player <id>] [--window-days <n>]
 *   pnpm --filter web run job:atlas note [--force]
 *
 * Exit codes: 0 done · 1 usage or unexpected error · 2 the work itself failed
 * (the map/rung row carries the reason for the UI).
 */
import "./env";
import { db } from "../apps/web/src/db/client";
import { assignDisciplines } from "../apps/web/src/lib/atlas/disciplines";
import { draftMap } from "../apps/web/src/lib/atlas/draftMap";
import { runWeeklyFrontier } from "../apps/web/src/lib/atlas/frontier";
import { preloadMap } from "../apps/web/src/lib/atlas/preload";
import { runEngine } from "../apps/web/src/lib/atlas/game/engine";
import { ensureRung, isRungLevel } from "../apps/web/src/lib/atlas/rungs";
import { spawnPreloadShards } from "../apps/web/src/lib/atlas/runner";

const args = process.argv.slice(2);
const sub = args[0];
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};
const has = (name: string): boolean => args.includes(`--${name}`);

const usage = (): never => {
  console.error(
    [
      "usage:",
      "  job:atlas draft-map --map <id>",
      "  job:atlas rung --node <id> --level <eli10|onepager|deepdive> [--force]",
      "  job:atlas preload --map <id> [--shard <k> --shards <n>]",
      "  job:atlas disciplines --map <id> [--force]",
      "  job:atlas engine [--player <id>] [--window-days <n>]",
      "  job:atlas note [--force]",
    ].join("\n"),
  );
  process.exit(1);
};

const main = async (): Promise<number> => {
  const startedAt = new Date().toISOString();
  switch (sub) {
    case "draft-map": {
      const mapId = Number(flag("map"));
      if (!Number.isInteger(mapId)) usage();
      console.log(`atlas draft-map #${mapId} starting ${startedAt}`);
      const res = draftMap(db, mapId);
      if (!res.ok) return 2;
      // The map is browsable fog now; the one-pagers (and the ready email)
      // land in the background.
      const shards = spawnPreloadShards(mapId);
      console.log(`spawned ${shards} preload shards for map #${mapId}`);
      return 0;
    }
    case "preload": {
      const mapId = Number(flag("map"));
      const shard = Number(flag("shard") ?? 0);
      const shards = Number(flag("shards") ?? 1);
      if (!Number.isInteger(mapId)) usage();
      console.log(`atlas preload #${mapId} shard ${shard}/${shards} starting ${startedAt}`);
      const res = await preloadMap(db, mapId, { shard, shards });
      return res.failed > 0 ? 2 : 0;
    }
    case "disciplines": {
      // Backfill discipline tags on a map drafted before PR-C (new maps are
      // tagged at draft time). One classification call per branch.
      const mapId = Number(flag("map"));
      if (!Number.isInteger(mapId)) usage();
      console.log(`atlas disciplines #${mapId} starting ${startedAt}`);
      const res = assignDisciplines(db, mapId, { force: has("force") });
      return res.unknownTitles.length > 0 ? 2 : 0;
    }
    case "engine": {
      // The nightly achievement pass (PR-D): base-rule sweep + one model
      // call per player over the window's events. launchd runs it at 04:30
      // (com.sprout.atlas-engine.plist); the flags are for test runs.
      const player = flag("player");
      const windowDays = flag("window-days");
      if (player !== undefined && !Number.isInteger(Number(player))) usage();
      if (windowDays !== undefined && !(Number(windowDays) > 0)) usage();
      console.log(`atlas engine starting ${startedAt}`);
      const res = runEngine(db, {
        playerId: player === undefined ? undefined : Number(player),
        windowDays: windowDays === undefined ? undefined : Number(windowDays),
        log: (msg) => console.log(msg),
      });
      console.log(
        `engine run #${res.runId}: ${res.status}, ${res.grants} grant(s), window ${res.windowStart.toISOString()} → ${res.windowEnd.toISOString()}${res.error ? `, error: ${res.error}` : ""}`,
      );
      return res.status === "ready" ? 0 : 2;
    }
    case "note": {
      // The weekly frontier note (PR2): pick, pre-draft both rungs, deliver
      // per the atlasDelivery setting. launchd runs it Wednesdays 06:30
      // (com.sprout.atlas.plist); --force adds a second pick for the week.
      console.log(`atlas note starting ${startedAt}`);
      const res = await runWeeklyFrontier(db, { force: has("force"), log: (msg) => console.log(msg) });
      return res.status === "failed" ? 2 : 0;
    }
    case "rung": {
      const nodeId = Number(flag("node"));
      const level = flag("level") ?? "";
      if (!Number.isInteger(nodeId) || !isRungLevel(level)) usage();
      console.log(`atlas rung ${level} for node #${nodeId} starting ${startedAt}`);
      const res = await ensureRung(db, nodeId, level, { force: has("force") });
      return res.ok ? 0 : 2;
    }
    default:
      return usage();
  }
};

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
