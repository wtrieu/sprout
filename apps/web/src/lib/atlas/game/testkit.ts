/**
 * Test fixtures for the engine: an in-memory migrated DB, a small world, and
 * one-line event logging. Imported by *.test.ts only.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "../../../db/schema";
import type { DB } from "../../../db/client";
import type { AtlasDiscipline } from "../../../db/schema";
import { logEvent } from "../events";
import { createPlayer } from "../players";

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../db/migrations",
);

export const makeDb = (): DB => {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = OFF");
  const db = drizzle(sqlite, { schema }) as unknown as DB;
  migrate(db, { migrationsFolder });
  sqlite.pragma("foreign_keys = ON");
  return db;
};

export const makePlayer = (db: DB, email = "way@x.y", persona: "cartographer" | "protege" = "cartographer") => {
  const created = createPlayer(db, { email, name: "Way", persona });
  if (!created.ok) throw new Error(created.error);
  return created.player;
};

const DISCIPLINES: AtlasDiscipline[] = ["reasoning", "evidence", "language", "systems", "creativity"];

export type World = {
  mapId: number;
  /** Branch node ids, in position order. */
  branches: number[];
  /** Children by branch id. */
  kids: Map<number, number[]>;
  /** Every child id, branch by branch. */
  all: number[];
};

/**
 * One map: `branchCount` branches of `kidCount` children. Disciplines
 * rotate across children so every discipline exists; branches are tagged
 * reasoning.
 */
export const seedWorld = (db: DB, branchCount = 3, kidCount = 5, title = "Philosophy"): World => {
  const map = db.insert(schema.atlasMaps).values({ title, status: "ready" }).returning().get();
  const branches: number[] = [];
  const kids = new Map<number, number[]>();
  const all: number[] = [];
  let n = 0;
  for (let b = 0; b < branchCount; b += 1) {
    const branch = db
      .insert(schema.atlasNodes)
      .values({
        mapId: map.id,
        parentId: null,
        position: b,
        title: `Branch ${b + 1}`,
        blurb: "b",
        kind: "branch",
        discipline: "reasoning",
      })
      .returning()
      .get();
    branches.push(branch.id);
    const list: number[] = [];
    for (let k = 0; k < kidCount; k += 1) {
      const kid = db
        .insert(schema.atlasNodes)
        .values({
          mapId: map.id,
          parentId: branch.id,
          position: k,
          title: `Node ${b + 1}.${k + 1}`,
          blurb: "k",
          kind: "school",
          discipline: DISCIPLINES[n % DISCIPLINES.length]!,
        })
        .returning()
        .get();
      n += 1;
      list.push(kid.id);
      all.push(kid.id);
    }
    kids.set(branch.id, list);
  }
  return { mapId: map.id, branches, kids, all };
};

export type LogOpts = { at?: Date; data?: Record<string, unknown> };

export const log = (db: DB, playerId: number, verb: string, nodeId: number | null, opts: LogOpts = {}) =>
  logEvent(db, { playerId, verb, nodeId, data: opts.data ?? null, at: opts.at });

export const open = (db: DB, p: number, node: number, at?: Date) => log(db, p, "open_node", node, { at });
export const read = (db: DB, p: number, node: number, level: string, at?: Date) =>
  log(db, p, "read_rung", node, { at, data: { level } });
export const pass = (db: DB, p: number, node: number, at?: Date) =>
  log(db, p, "pass_quiz", node, { at, data: { score: 3 } });
export const fail = (db: DB, p: number, node: number, at?: Date) =>
  log(db, p, "fail_quiz", node, { at, data: { score: 1 } });

/** Full mastery: all three rungs read and the quiz passed. */
export const master = (db: DB, p: number, node: number, at?: Date) => {
  open(db, p, node, at);
  for (const l of ["eli10", "onepager", "deepdive"]) read(db, p, node, l, at);
  pass(db, p, node, at);
};
