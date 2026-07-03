/**
 * Nightly: crawl all enabled sources (network only — no model in memory),
 * then hand off to the orchestrator to classify/embed what came in and render
 * any queued story images. Run via: pnpm --filter web run job:nightly
 */
import { spawnSync } from "node:child_process";
import { db } from "../apps/web/src/db/client";
import { crawlAllSources } from "../apps/web/src/lib/crawl";

const main = async () => {
  console.log(`nightly pipeline starting ${new Date().toISOString()}`);
  const summaries = await crawlAllSources(db);
  for (const s of summaries) {
    console.log(
      `crawl ${s.slug}: ${s.inserted} new / ${s.seen} seen${s.error ? ` — ERROR: ${s.error}` : ""}`,
    );
  }

  // Same process would also work, but exec keeps run-jobs the single code path.
  const res = spawnSync("pnpm", ["tsx", "../../scripts/run-jobs.ts"], {
    cwd: process.cwd(), // apps/web
    stdio: "inherit",
    env: process.env,
    timeout: 2 * 60 * 60 * 1000,
  });
  process.exit(res.status ?? 0);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
