import { sql } from "drizzle-orm";
import type { DB } from "../db/client";
import { jobs, type JobLane, type JobType } from "../db/schema";

// Lock is considered stale after 2h — a crashed orchestrator must not wedge
// the queue forever.
const LOCK_STALE_MS = 2 * 60 * 60 * 1000;

export type JobRow = {
  id: number;
  type: JobType;
  lane: JobLane;
  payload: Record<string, unknown>;
  status: "pending" | "running" | "done" | "failed";
  priority: number;
  attempts: number;
};

export const enqueue = (
  db: DB,
  job: { type: JobType; lane: JobLane; payload: Record<string, unknown>; priority?: number },
): void => {
  db.insert(jobs)
    .values({
      type: job.type,
      lane: job.lane,
      payload: job.payload,
      priority: job.priority ?? 100,
    })
    .run();
};

/**
 * Atomically claim the next pending job in a lane. UPDATE…RETURNING on the
 * subquery-selected row is atomic in SQLite, so concurrent claimers (web
 * process vs orchestrator) can never grab the same job.
 */
export const claimNext = (db: DB, lane: JobLane): JobRow | null => {
  const row = db.get<Record<string, unknown>>(sql`
    UPDATE jobs
    SET status = 'running', started_at = unixepoch(), attempts = attempts + 1
    WHERE id = (
      SELECT id FROM jobs
      WHERE status = 'pending' AND lane = ${lane}
      ORDER BY priority ASC, id ASC
      LIMIT 1
    )
    RETURNING id, type, lane, payload, status, priority, attempts
  `);
  if (!row) return null;
  return {
    id: row.id as number,
    type: row.type as JobType,
    lane: row.lane as JobLane,
    payload: JSON.parse(row.payload as string) as Record<string, unknown>,
    status: row.status as JobRow["status"],
    priority: row.priority as number,
    attempts: row.attempts as number,
  };
};

export const completeJob = (db: DB, id: number): void => {
  db.run(
    sql`UPDATE jobs SET status = 'done', finished_at = unixepoch(), error = NULL WHERE id = ${id}`,
  );
};

const MAX_ATTEMPTS = 3;

/** Fail a job: back to pending until the attempt cap, then terminal 'failed'. */
export const failJob = (db: DB, id: number, error: string): void => {
  db.run(sql`
    UPDATE jobs
    SET status = CASE WHEN attempts >= ${MAX_ATTEMPTS} THEN 'failed' ELSE 'pending' END,
        finished_at = unixepoch(),
        error = ${error.slice(0, 2000)}
    WHERE id = ${id}
  `);
};

export const acquireLock = (db: DB, owner: string): boolean => {
  db.run(sql`INSERT OR IGNORE INTO job_lock (id, locked_by, locked_at) VALUES (1, NULL, NULL)`);
  const staleBefore = Math.floor((Date.now() - LOCK_STALE_MS) / 1000);
  const row = db.get<{ id: number }>(sql`
    UPDATE job_lock
    SET locked_by = ${owner}, locked_at = unixepoch()
    WHERE id = 1 AND (locked_by IS NULL OR locked_by = ${owner} OR locked_at < ${staleBefore})
    RETURNING id
  `);
  return row !== undefined && row !== null;
};

export const releaseLock = (db: DB, owner: string): void => {
  db.run(
    sql`UPDATE job_lock SET locked_by = NULL, locked_at = NULL WHERE id = 1 AND locked_by = ${owner}`,
  );
};

/** True while an orchestrator run holds the lock (used to 503 chat during image batches). */
export const isLocked = (db: DB): boolean => {
  const staleBefore = Math.floor((Date.now() - LOCK_STALE_MS) / 1000);
  const row = db.get<{ locked_by: string | null; locked_at: number | null }>(
    sql`SELECT locked_by, locked_at FROM job_lock WHERE id = 1`,
  );
  return !!row?.locked_by && (row.locked_at ?? 0) >= staleBefore;
};
