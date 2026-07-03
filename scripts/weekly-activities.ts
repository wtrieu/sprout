/**
 * Weekly activities: enqueue the generation job and run the orchestrator
 * (which respects the job lock, so this never fights an image batch).
 * Run via: pnpm --filter web run job:activities
 */
import { spawnSync } from "node:child_process";
import { db } from "../apps/web/src/db/client";
import { enqueue } from "../apps/web/src/lib/jobs";

enqueue(db, { type: "activities", lane: "llm", payload: {}, priority: 20 });
console.log("activities job enqueued");

const res = spawnSync("pnpm", ["tsx", "../../scripts/run-jobs.ts"], {
  cwd: process.cwd(), // apps/web
  stdio: "inherit",
  env: process.env,
  timeout: 60 * 60 * 1000,
});
process.exit(res.status ?? 0);
