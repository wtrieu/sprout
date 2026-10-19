/**
 * Atlas runner. Every piece of model work for the Atlas module runs here,
 * detached from the web process (spawned by the API routes, or run by hand),
 * on the headless `claude -p` path — Max subscription; ANTHROPIC_API_KEY is
 * stripped inside lib/stories/claudeCli.ts so a run can never bill the API.
 *
 *   pnpm --filter web run job:atlas draft-map --map <id>
 *   pnpm --filter web run job:atlas rung --node <id> --level <eli10|onepager|deepdive> [--force]
 *
 * Exit codes: 0 done · 1 usage or unexpected error · 2 the work itself failed
 * (the map/rung row carries the reason for the UI).
 */
import "./env";
import { db } from "../apps/web/src/db/client";
import { draftMap } from "../apps/web/src/lib/atlas/draftMap";
import { ensureRung, isRungLevel } from "../apps/web/src/lib/atlas/rungs";

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
      return res.ok ? 0 : 2;
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
