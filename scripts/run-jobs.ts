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
import { claimNext, completeJob, failJob, acquireLock, releaseLock, enqueue } from "../apps/web/src/lib/jobs";
import { executeLlmJob, reconcileStories } from "../apps/web/src/lib/executors";
import { unloadOllamaModel, resolveVlmModel } from "../apps/web/src/lib/ollama";
import {
  gradePageImage,
  gradeRefImage,
  QC_MAX_RENDER_ATTEMPTS,
} from "../apps/web/src/lib/skills/imageQc";

const OWNER = `run-jobs-${process.pid}`;
const REPO_ROOT = path.resolve(process.cwd(), "../..");
const IMAGES_DIR = process.env.IMAGES_DIR ?? path.join(REPO_ROOT, "data/images");

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

/**
 * Grade every ungraded render with the QC VLM; re-queue failures with a
 * bumped seed (via render_attempts). Returns how many renders were re-queued.
 * Runs AFTER the image worker exits — the ~6GB VLM never coexists with FLUX.
 */
const runImageQc = async (): Promise<number> => {
  const vlm = await resolveVlmModel();
  if (!vlm) {
    console.log("image QC skipped — no vision model pulled (ollama pull qwen2.5vl:7b)");
    return 0;
  }
  console.log(`image QC using ${vlm}`);
  let requeued = 0;

  const refs = db.all<{ id: number; characterId: number; styleKey: string; imagePath: string; renderAttempts: number }>(sql`
    SELECT id, character_id as characterId, style_key as styleKey,
           image_path as imagePath, render_attempts as renderAttempts
    FROM character_style_refs WHERE image_path IS NOT NULL AND qc_status IS NULL
  `);
  for (const ref of refs) {
    try {
      const verdict = await gradeRefImage(IMAGES_DIR, ref.imagePath, vlm);
      if (!verdict.pass && ref.renderAttempts < QC_MAX_RENDER_ATTEMPTS) {
        db.run(sql`UPDATE character_style_refs SET render_attempts = render_attempts + 1, qc_note = ${verdict.note} WHERE id = ${ref.id}`);
        enqueue(db, {
          type: "char_reference",
          lane: "imagegen",
          payload: { characterId: ref.characterId, styleKey: ref.styleKey },
          priority: 1,
        });
        requeued += 1;
        console.log(`QC re-roll ref char ${ref.characterId}/${ref.styleKey}: ${verdict.note}`);
      } else {
        db.run(sql`UPDATE character_style_refs SET qc_status = ${verdict.pass ? "passed" : "failed"}, qc_note = ${verdict.note} WHERE id = ${ref.id}`);
        if (!verdict.pass) console.log(`QC accepting flawed ref char ${ref.characterId}/${ref.styleKey} after ${ref.renderAttempts} re-rolls: ${verdict.note}`);
      }
    } catch (err) {
      console.error(`QC error on ref ${ref.imagePath}: ${err instanceof Error ? err.message : err}`);
    }
  }

  const pages = db.all<{ id: number; storyId: number; pageIndex: number; imagePath: string; renderAttempts: number }>(sql`
    SELECT id, story_id as storyId, page_index as pageIndex,
           image_path as imagePath, render_attempts as renderAttempts
    FROM story_pages WHERE image_status = 'done' AND image_path IS NOT NULL AND qc_status IS NULL
  `);
  for (const page of pages) {
    try {
      const verdict = await gradePageImage(IMAGES_DIR, page.imagePath, vlm);
      if (!verdict.pass && page.renderAttempts < QC_MAX_RENDER_ATTEMPTS) {
        db.run(sql`UPDATE story_pages SET render_attempts = render_attempts + 1, image_status = 'pending', qc_note = ${verdict.note} WHERE id = ${page.id}`);
        enqueue(db, {
          type: "story_image",
          lane: "imagegen",
          payload: { storyId: page.storyId, pageIndex: page.pageIndex },
          priority: 100 + page.pageIndex,
        });
        requeued += 1;
        console.log(`QC re-roll story ${page.storyId} p${page.pageIndex}: ${verdict.note}`);
      } else {
        db.run(sql`UPDATE story_pages SET qc_status = ${verdict.pass ? "passed" : "failed"}, qc_note = ${verdict.note} WHERE id = ${page.id}`);
        if (!verdict.pass) console.log(`QC accepting flawed page story ${page.storyId} p${page.pageIndex} after ${page.renderAttempts} re-rolls: ${verdict.note}`);
      }
    } catch (err) {
      console.error(`QC error on page ${page.imagePath}: ${err instanceof Error ? err.message : err}`);
    }
  }

  // Free the VLM before FLUX loads again for any re-rolls.
  await unloadOllamaModel(vlm);
  console.log(`image QC: ${refs.length} refs + ${pages.length} pages graded, ${requeued} re-queued`);
  return requeued;
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

    // Render → grade → re-roll failed seeds, bounded. Each phase holds only
    // one model: FLUX exits before the QC VLM loads, and vice versa.
    for (let cycle = 0; cycle < 1 + QC_MAX_RENDER_ATTEMPTS; cycle++) {
      runImageWorker();
      if ((await runImageQc()) === 0) break;
    }
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
