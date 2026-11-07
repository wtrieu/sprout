import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "../../db/schema";
import type { DB } from "../../db/client";
import { MAP_STALE_MS, enqueueMapDraft, promoteNextQueuedMap, reapStaleMaps } from "./runner";

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../db/migrations",
);

const makeDb = (): DB => {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = OFF");
  const db = drizzle(sqlite, { schema }) as unknown as DB;
  migrate(db, { migrationsFolder });
  sqlite.pragma("foreign_keys = ON");
  return db;
};

const T0 = new Date("2026-01-01T00:00:00Z");
const minutes = (n: number) => new Date(T0.getTime() + n * 60_000);

const addMap = (
  db: DB,
  title: string,
  status: "queued" | "drafting" | "ready" | "failed",
  createdAt: Date,
) => db.insert(schema.atlasMaps).values({ title, status, createdAt }).returning().get();
const statusOf = (db: DB, id: number) =>
  db.select().from(schema.atlasMaps).where(eq(schema.atlasMaps.id, id)).get()!.status;

const recorder = () => {
  const spawned: number[] = [];
  return { spawned, spawn: (id: number) => void spawned.push(id) };
};

describe("promoteNextQueuedMap", () => {
  it("claims the oldest queued map (createdAt, then id), flips it to drafting, spawns once", () => {
    const db = makeDb();
    const newer = addMap(db, "Newer", "queued", minutes(5));
    const oldest = addMap(db, "Oldest", "queued", minutes(1));
    const rec = recorder();
    const now = minutes(30);

    expect(promoteNextQueuedMap(db, { ...rec, now })).toBe(oldest.id);
    expect(rec.spawned).toEqual([oldest.id]);
    expect(statusOf(db, oldest.id)).toBe("drafting");
    expect(statusOf(db, newer.id)).toBe("queued");
    // createdAt is the "drafting since" clock: waiting in the queue must not make it stale.
    const promoted = db.select().from(schema.atlasMaps).where(eq(schema.atlasMaps.id, oldest.id)).get()!;
    expect(promoted.createdAt.getTime()).toBe(now.getTime());
  });

  it("breaks createdAt ties by id", () => {
    const db = makeDb();
    const a = addMap(db, "A", "queued", minutes(1));
    addMap(db, "B", "queued", minutes(1));
    const rec = recorder();
    expect(promoteNextQueuedMap(db, rec)).toBe(a.id);
  });

  it("is a no-op while another map is drafting (at most one drafting at a time)", () => {
    const db = makeDb();
    addMap(db, "Busy", "drafting", minutes(1));
    const q = addMap(db, "Waiting", "queued", minutes(2));
    const rec = recorder();
    expect(promoteNextQueuedMap(db, rec)).toBeNull();
    expect(rec.spawned).toEqual([]);
    expect(statusOf(db, q.id)).toBe("queued");
  });

  it("is a no-op with an empty queue", () => {
    const db = makeDb();
    addMap(db, "Done", "ready", minutes(1));
    const rec = recorder();
    expect(promoteNextQueuedMap(db, rec)).toBeNull();
    expect(rec.spawned).toEqual([]);
  });

  it("is an atomic claim: two promoters racing for one queued map spawn exactly one draft", () => {
    const db = makeDb();
    const q = addMap(db, "Only", "queued", minutes(1));
    const rec = recorder();
    const first = promoteNextQueuedMap(db, rec);
    const second = promoteNextQueuedMap(db, rec);
    expect(first).toBe(q.id);
    expect(second).toBeNull();
    expect(rec.spawned).toEqual([q.id]);
  });

  it("never drafts two maps at once even with several queued and repeated promotion", () => {
    const db = makeDb();
    const ids = [1, 2, 3].map((i) => addMap(db, `Q${i}`, "queued", minutes(i)).id);
    const rec = recorder();
    for (let i = 0; i < 5; i++) promoteNextQueuedMap(db, rec);
    expect(rec.spawned).toEqual([ids[0]]);
    const drafting = db.select().from(schema.atlasMaps).where(eq(schema.atlasMaps.status, "drafting")).all();
    expect(drafting).toHaveLength(1);
  });
});

describe("enqueueMapDraft", () => {
  it("inserts drafting and spawns when nothing is drafting", () => {
    const db = makeDb();
    const rec = recorder();
    const map = enqueueMapDraft(db, { title: "Physics", brief: null }, rec);
    expect(map.status).toBe("drafting");
    expect(rec.spawned).toEqual([map.id]);
  });

  it("inserts queued, without spawning, while another map is drafting", () => {
    const db = makeDb();
    const rec = recorder();
    const first = enqueueMapDraft(db, { title: "Physics", brief: null }, rec);
    const second = enqueueMapDraft(db, { title: "Biology", brief: "cells" }, rec);
    expect(second.status).toBe("queued");
    expect(second.brief).toBe("cells");
    expect(rec.spawned).toEqual([first.id]);
  });

  it("does not wait behind a stale drafting map: it is reaped and the new map starts", () => {
    const db = makeDb();
    const stale = addMap(db, "Crashed", "drafting", T0);
    const rec = recorder();
    const now = new Date(T0.getTime() + MAP_STALE_MS + 60_000);
    const map = enqueueMapDraft(db, { title: "Fresh", brief: null }, { ...rec, now });
    expect(statusOf(db, stale.id)).toBe("failed");
    expect(map.status).toBe("drafting");
    expect(rec.spawned).toEqual([map.id]);
  });
});

describe("reapStaleMaps", () => {
  const afterDeadline = new Date(T0.getTime() + MAP_STALE_MS + 60_000);

  it("never reaps queued rows, however old (they wait behind a fresh drafting map)", () => {
    const db = makeDb();
    const busy = addMap(db, "Busy", "drafting", new Date(T0.getTime() + 10 * MAP_STALE_MS));
    const q = addMap(db, "Waiting", "queued", T0);
    const rec = recorder();
    expect(reapStaleMaps(db, new Date(T0.getTime() + 10 * MAP_STALE_MS), rec)).toBe(0);
    expect(statusOf(db, q.id)).toBe("queued");
    expect(statusOf(db, busy.id)).toBe("drafting");
    expect(rec.spawned).toEqual([]);
  });

  it("promotes a queued map even when nothing was reaped and nothing is drafting (job died after ready)", () => {
    const db = makeDb();
    const done = addMap(db, "Done", "ready", T0);
    const waiting = addMap(db, "Waiting", "queued", minutes(1));
    const rec = recorder();

    expect(reapStaleMaps(db, minutes(5), rec)).toBe(0);
    expect(statusOf(db, done.id)).toBe("ready");
    expect(statusOf(db, waiting.id)).toBe("drafting");
    expect(rec.spawned).toEqual([waiting.id]);

    // Idempotent: the next poll sees a drafting map and does nothing.
    expect(reapStaleMaps(db, minutes(6), rec)).toBe(0);
    expect(rec.spawned).toEqual([waiting.id]);
  });

  it("reaps a stale drafting map to failed and promotes the next queued map", () => {
    const db = makeDb();
    const stale = addMap(db, "Crashed", "drafting", T0);
    const next = addMap(db, "Next", "queued", minutes(1));
    const later = addMap(db, "Later", "queued", minutes(2));
    const rec = recorder();

    expect(reapStaleMaps(db, afterDeadline, rec)).toBe(1);
    expect(statusOf(db, stale.id)).toBe("failed");
    expect(statusOf(db, next.id)).toBe("drafting");
    expect(statusOf(db, later.id)).toBe("queued");
    expect(rec.spawned).toEqual([next.id]);

    // The promoted map is a fresh drafting row, so a second sweep leaves it alone.
    expect(reapStaleMaps(db, afterDeadline, rec)).toBe(0);
    expect(rec.spawned).toEqual([next.id]);
  });

  it("leaves a fresh drafting map and the queue untouched", () => {
    const db = makeDb();
    const busy = addMap(db, "Busy", "drafting", minutes(10));
    const q = addMap(db, "Waiting", "queued", minutes(11));
    const rec = recorder();
    expect(reapStaleMaps(db, minutes(12), rec)).toBe(0);
    expect(statusOf(db, busy.id)).toBe("drafting");
    expect(statusOf(db, q.id)).toBe("queued");
    expect(rec.spawned).toEqual([]);
  });
});
