/**
 * THE orchestrator. The only process that executes queued jobs, in strictly
 * sequential lanes so the 14B chat model and FLUX never coexist in 24GB:
 *
 *   1. drain llm lane (relevance, embeddings, story text) via Ollama
 *   2. unload Ollama (keep_alive:0 + `ollama stop`)
 *   3. spawn services/imagegen/worker.py in drain-and-exit mode
 *
 * Guarded by the single-row job_lock (stale after 2h). Run via:
 *   pnpm --filter web run job:run
 */
import "./env"; // .env.local in dev (ANTHROPIC_API_KEY etc.); launchd env wins in prod
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "../apps/web/src/db/client";
import { claimNext, completeJob, failJob, acquireLock, releaseLock } from "../apps/web/src/lib/jobs";
import { executeLlmJob, reconcileStories } from "../apps/web/src/lib/executors";
import { unloadOllamaModel } from "../apps/web/src/lib/ollama";

const OWNER = `run-jobs-${process.pid}`;
const REPO_ROOT = path.resolve(process.cwd(), "../..");

const drainLlmLane = async (): Promise<number> => {
  let n = 0;
  for (;;) {
    const job = claimNext(db, "llm");
    if (!job) break;
    n += 1;
    try {
      await executeLlmJob(db, job);
      completeJob(db, job.id);
      console.log(`llm job ${job.id} (${job.type}) done`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failJob(db, job.id, msg);
      console.error(`llm job ${job.id} (${job.type}) failed: ${msg}`);
    }
  }
  return n;
};

const runImageWorker = (): void => {
  const pending = db.get<{ n: number }>(
    sql`SELECT COUNT(*) as n FROM jobs WHERE status = 'pending' AND lane = 'imagegen'`,
  );
  if (!pending || pending.n === 0) return;

  const workerDir = path.join(REPO_ROOT, "services/imagegen");
  if (!fs.existsSync(path.join(workerDir, "worker.py"))) {
    console.log("imagegen worker not installed yet — leaving image jobs queued");
    return;
  }

  console.log(`spawning image worker for ${pending.n} job(s)…`);
  // drain-and-exit: the process loads FLUX once, renders everything pending,
  // then dies — releasing its ~12GB. stdio inherited so launchd logs capture it.
  const res = spawnSync("uv", ["run", "worker.py"], {
    cwd: workerDir,
    stdio: "inherit",
    env: {
      ...process.env,
      SPROUT_DB: process.env.DATABASE_URL ?? path.join(REPO_ROOT, "data/sprout.db"),
      IMAGES_DIR: process.env.IMAGES_DIR ?? path.join(REPO_ROOT, "data/images"),
    },
    timeout: 60 * 60 * 1000,
  });
  if (res.status !== 0) {
    console.error(`image worker exited with status ${res.status}`);
  }
};

const main = async () => {
  if (!acquireLock(db, OWNER)) {
    console.log("another orchestrator run holds the lock — exiting");
    return;
  }
  try {
    const llmCount = await drainLlmLane();
    console.log(`llm lane drained (${llmCount} jobs)`);

    // Free the ~9GB chat model before FLUX loads its ~12GB.
    await unloadOllamaModel();
    spawnSync("ollama", ["stop", process.env.OLLAMA_MODEL ?? "qwen3:14b"], { stdio: "ignore" });

    runImageWorker();
    reconcileStories(db);
  } finally {
    releaseLock(db, OWNER);
  }
  console.log("run-jobs complete");
};

main().catch((err) => {
  releaseLock(db, OWNER);
  console.error(err);
  process.exit(1);
});
