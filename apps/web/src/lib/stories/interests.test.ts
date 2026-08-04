import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "../../db/schema";
import type { DB } from "../../db/client";
import {
  decayInterests,
  northStarShares,
  nudgeInterestsByTags,
  sampleInterests,
} from "./interests";

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

const insert = (db: DB, values: Partial<typeof schema.interests.$inferInsert>) =>
  db
    .insert(schema.interests)
    .values({
      kind: "interest",
      label: "diggers",
      brief: "obsessed with diggers",
      tags: ["diggers"],
      ...values,
    })
    .returning()
    .get();

describe("northStarShares", () => {
  it("caps summed shares at 0.5 so half the library stays unconstrained", () => {
    const db = makeDb();
    insert(db, { kind: "north-star", label: "culture", share: 0.3, tags: ["taiwanese"] });
    insert(db, { kind: "north-star", label: "music", share: 0.3, tags: ["music"] });
    insert(db, { kind: "north-star", label: "space", share: 0.2, tags: ["space"] });
    const shares = northStarShares(db);
    const total = shares.reduce((s, x) => s + x.share, 0);
    expect(total).toBeCloseTo(0.5);
    // Proportions preserved: 0.3 : 0.3 : 0.2 → 0.1875 : 0.1875 : 0.125
    expect(shares.find((s) => s.label === "space")!.share).toBeCloseTo(0.125);
  });

  it("uses the default 0.2 share when unset and ignores suggestions/archived", () => {
    const db = makeDb();
    insert(db, { kind: "north-star", label: "culture", tags: ["taiwanese"] });
    insert(db, { kind: "north-star", label: "later", status: "suggested", tags: ["x"] });
    const shares = northStarShares(db);
    expect(shares).toHaveLength(1);
    expect(shares[0].share).toBe(0.2);
  });
});

describe("sampleInterests", () => {
  it("samples proportionally to weight, without replacement", () => {
    const db = makeDb();
    insert(db, { label: "diggers", weight: 5, tags: ["diggers"] });
    insert(db, { label: "moon", weight: 1, tags: ["moon"] });
    insert(db, { label: "dogs", weight: 1, tags: ["dogs"] });
    let counts: Record<string, number> = {};
    let seed = 3;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let i = 0; i < 200; i++) {
      const picked = sampleInterests(db, 2, rand);
      expect(new Set(picked.map((p) => p.label)).size).toBe(picked.length);
      for (const p of picked) counts[p.label] = (counts[p.label] ?? 0) + 1;
    }
    expect(counts["diggers"]).toBeGreaterThan(counts["moon"]);
  });

  it("excludes suggested and archived interests", () => {
    const db = makeDb();
    insert(db, { label: "active one" });
    insert(db, { label: "pending", status: "suggested" });
    insert(db, { label: "gone", status: "archived" });
    const picked = sampleInterests(db, 5, () => 0.5);
    expect(picked.map((p) => p.label)).toEqual(["active one"]);
  });
});

describe("decayInterests", () => {
  it("drops weight after 3 quiet weeks and archives at 0", () => {
    const db = makeDb();
    const old = new Date(Date.now() - 30 * 86400 * 1000);
    const stale = insert(db, { label: "stale", weight: 2, createdAt: old });
    const dying = insert(db, { label: "dying", weight: 1, createdAt: old });
    const fresh = insert(db, { label: "fresh", weight: 3, createdAt: old, lastReinforcedAt: new Date() });

    expect(decayInterests(db)).toBe(2);
    expect(db.select().from(schema.interests).where(eq(schema.interests.id, stale.id)).get()!.weight).toBe(1);
    const died = db.select().from(schema.interests).where(eq(schema.interests.id, dying.id)).get()!;
    expect(died.weight).toBe(0);
    expect(died.status).toBe("archived");
    expect(db.select().from(schema.interests).where(eq(schema.interests.id, fresh.id)).get()!.weight).toBe(3);

    // Immediately after decay, nothing further decays (clock reset).
    expect(decayInterests(db)).toBe(0);
  });
});

describe("nudgeInterestsByTags (review-as-intake)", () => {
  it("reinforces matching interests up to the cap and refreshes the clock", () => {
    const db = makeDb();
    const row = insert(db, { label: "moon", weight: 4, tags: ["moon", "stars"] });
    insert(db, { label: "dogs", weight: 2, tags: ["dogs"] });
    expect(nudgeInterestsByTags(db, ["Moon", "rabbit"], 1)).toBe(1);
    expect(nudgeInterestsByTags(db, ["moon"], 1)).toBe(1);
    const after = db.select().from(schema.interests).where(eq(schema.interests.id, row.id)).get()!;
    expect(after.weight).toBe(5); // capped
    expect(after.lastReinforcedAt).not.toBeNull();
  });

  it("cools on rejection but never below 1 and never archives", () => {
    const db = makeDb();
    const row = insert(db, { label: "moon", weight: 1, tags: ["moon"] });
    nudgeInterestsByTags(db, ["moon"], -1);
    const after = db.select().from(schema.interests).where(eq(schema.interests.id, row.id)).get()!;
    expect(after.weight).toBe(1);
    expect(after.status).toBe("active");
  });
});
