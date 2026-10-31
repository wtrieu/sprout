import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { describe, expect, it } from "vitest";
import * as schema from "../../db/schema";
import type { DB } from "../../db/client";
import { eventData, eventsForPlayer, logEvent } from "./events";
import { createPlayer, playerForEmail, updatePlayer } from "./players";
import { mapProgressFor, nodeProgressFor, playerSummaries } from "./progress";

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

/** One map, one branch, two children; the branch and child 1 were visited
 *  pre-players, and child 1's one-pager was read. */
const seed = (db: DB) => {
  const map = db
    .insert(schema.atlasMaps)
    .values({ title: "Philosophy", status: "ready" })
    .returning()
    .get();
  const node = (
    parentId: number | null,
    position: number,
    title: string,
    extra: Partial<typeof schema.atlasNodes.$inferInsert> = {},
  ) =>
    db
      .insert(schema.atlasNodes)
      .values({
        mapId: map.id,
        parentId,
        position,
        title,
        blurb: `${title} — the live question.`,
        kind: parentId === null ? "branch" : "school",
        discipline: "reasoning",
        ...extra,
      })
      .returning()
      .get();
  const branch = node(null, 0, "The Stoics", { visitedAt: new Date("2026-10-01") });
  const kid1 = node(branch.id, 0, "Epictetus", { visitedAt: new Date("2026-10-02") });
  const kid2 = node(branch.id, 1, "Marcus Aurelius");
  db.insert(schema.atlasRungs)
    .values({
      nodeId: kid1.id,
      level: "onepager",
      status: "ready",
      bodyMd: "### ok",
      readAt: new Date("2026-10-02"),
    })
    .run();
  return { map, branch, kid1, kid2 };
};

describe("logEvent", () => {
  it("appends verbs as data, JSON payload round-trips, unknown verbs welcome", () => {
    const db = makeDb();
    seed(db);
    const created = createPlayer(db, { email: "a@b.c", name: "Way", persona: "cartographer" });
    if (!created.ok) throw new Error(created.error);
    const e = logEvent(db, {
      playerId: created.player.id,
      verb: "eureka",
      data: { note: "a verb PR-D invents" },
    });
    expect(e.verb).toBe("eureka");
    expect(eventData(e)).toEqual({ note: "a verb PR-D invents" });
    expect(eventData({ data: "not json" })).toEqual({});
  });
});

describe("players and the legacy import", () => {
  it("first character inherits pre-player progress; the second starts fresh", () => {
    const db = makeDb();
    const { branch, kid1, kid2 } = seed(db);
    const first = createPlayer(db, { email: "owner@x.y", name: "Way", persona: "cartographer" });
    if (!first.ok) throw new Error(first.error);
    // 2 visited nodes + 1 read rung.
    expect(first.importedEvents).toBe(3);
    const events = eventsForPlayer(db, first.player.id);
    const imported = events.filter((e) => eventData(e).imported === true);
    expect(imported).toHaveLength(3);
    expect(imported.find((e) => e.nodeId === kid1.id && e.verb === "read_rung")).toBeTruthy();
    // Backdated to when it actually happened.
    expect(imported.find((e) => e.nodeId === branch.id)?.createdAt).toEqual(
      new Date("2026-10-01"),
    );

    const second = createPlayer(db, { email: "wife@x.y", name: "Min", persona: "protege" });
    if (!second.ok) throw new Error(second.error);
    expect(second.importedEvents).toBe(0);
    expect(nodeProgressFor(db, second.player.id, kid1.id).tier.seen).toBe(false);
    expect(nodeProgressFor(db, first.player.id, kid2.id).tier.seen).toBe(false);
    expect(nodeProgressFor(db, first.player.id, kid1.id).tier.onepager).toBe(true);
  });

  it("one character per email; service tokens get none", () => {
    const db = makeDb();
    seed(db);
    expect(createPlayer(db, { email: "a@b.c", name: "A", persona: "protege" }).ok).toBe(true);
    const dup = createPlayer(db, { email: "a@b.c", name: "B", persona: "cartographer" });
    expect(dup).toEqual({ ok: false, error: "exists" });
    expect(createPlayer(db, { email: "service-token", name: "S", persona: "protege" })).toEqual({
      ok: false,
      error: "not-a-person",
    });
    expect(playerForEmail(db, "service-token")).toBeNull();
    expect(playerForEmail(db, null)).toBeNull();
  });

  it("a persona change is logged; a name change is not", () => {
    const db = makeDb();
    seed(db);
    const created = createPlayer(db, { email: "a@b.c", name: "A", persona: "protege" });
    if (!created.ok) throw new Error(created.error);
    updatePlayer(db, created.player.id, { name: "Also A" });
    updatePlayer(db, created.player.id, { persona: "cartographer" });
    const verbs = eventsForPlayer(db, created.player.id)
      .filter((e) => eventData(e).imported !== true)
      .map((e) => e.verb);
    expect(verbs).toEqual(["create_character", "choose_persona"]);
  });
});

describe("progress payloads", () => {
  it("map progress carries tiers, fog, branch and discipline levels per player", () => {
    const db = makeDb();
    const { map, branch, kid1, kid2 } = seed(db);
    const created = createPlayer(db, { email: "owner@x.y", name: "Way", persona: "cartographer" });
    if (!created.ok) throw new Error(created.error);
    const p = mapProgressFor(db, created.player.id, map.id);
    expect(p.tiers[kid1.id].onepager).toBe(true);
    expect(p.tiers[kid2.id].seen).toBe(false);
    // kid2 is revealed: its branch and sibling were visited.
    expect(p.revealed).toContain(kid2.id);
    expect(p.branches).toHaveLength(1);
    expect(p.branches[0].nodeId).toBe(branch.id);
    expect(p.branches[0].xp).toBe(20);
    expect(p.field.max).toBe(99);
    expect(p.disciplines.reasoning.xp).toBe(20);
    expect(p.totalLevel).toBe(5);

    const summaries = playerSummaries(db);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].totalLevel).toBe(5);
  });
});
