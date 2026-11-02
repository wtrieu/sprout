import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "../../../db/schema";
import type { DB } from "../../../db/client";
import { eventsForPlayer } from "../events";
import {
  BASE_RULES,
  checkBaseAchievements,
  grantAchievement,
  itemsByAchievement,
} from "./achievements";
import { classDef } from "./classes";
import { LOOT, rollLoot } from "./loot";
import { fail, makeDb, makePlayer, master, open, pass, read, seedWorld, type World } from "./testkit";

const NOON = new Date(2026, 9, 14, 12, 0, 0);
const at = (hour: number) => new Date(2026, 9, 14, hour, 0, 0);

type Scenario = (db: DB, p: number, w: World) => void;

/** One recipe per base rule, each earning that rule (and maybe others). */
const SCENARIOS: Record<string, Scenario> = {
  "first-open": (db, p, w) => open(db, p, w.all[0]!, NOON),
  "first-stamp": (db, p, w) => read(db, p, w.all[0]!, "eli10", NOON),
  "first-mastery": (db, p, w) => pass(db, p, w.all[0]!, NOON),
  "five-masteries": (db, p, w) => w.all.slice(0, 5).forEach((n) => pass(db, p, n, NOON)),
  "fifteen-masteries": (db, p, w) => w.all.forEach((n) => pass(db, p, n, NOON)),
  "first-deep-dive": (db, p, w) => read(db, p, w.all[0]!, "deepdive", NOON),
  "branch-50": (db, p, w) => w.all.slice(0, 2).forEach((n) => master(db, p, n, NOON)),
  "first-cape": (db, p, w) => [...w.branches, ...w.all].forEach((n) => master(db, p, n, NOON)),
  // Children rotate through the five disciplines, so the first five cover them all.
  "all-disciplines": (db, p, w) => w.all.slice(0, 5).forEach((n) => pass(db, p, n, NOON)),
  "dawn-reader": (db, p, w) => w.all.slice(0, 3).forEach((n) => read(db, p, n, "eli10", at(5))),
  "night-owl": (db, p, w) => w.all.slice(0, 3).forEach((n) => read(db, p, n, "eli10", at(23))),
  comeback: (db, p, w) => {
    for (let i = 0; i < 3; i += 1) fail(db, p, w.all[0]!, NOON);
    pass(db, p, w.all[0]!, NOON);
  },
};

const granted = (db: DB, playerId: number) =>
  db
    .select()
    .from(schema.atlasAchievements)
    .where(eq(schema.atlasAchievements.playerId, playerId))
    .all();

describe("base rules", () => {
  it("ships twelve rules, three of them hidden, each with a recipe", () => {
    expect(BASE_RULES).toHaveLength(12);
    expect(Object.keys(SCENARIOS).sort()).toEqual(BASE_RULES.map((r) => r.slug).sort());
    expect(BASE_RULES.filter((r) => r.hidden).map((r) => r.slug).sort()).toEqual([
      "comeback",
      "dawn-reader",
      "night-owl",
    ]);
  });

  it("hidden rules carry wildcard class ids that exist", () => {
    for (const r of BASE_RULES.filter((x) => x.hidden)) {
      expect(r.wildcard && classDef(r.wildcard)).toBeTruthy();
    }
    expect(BASE_RULES.filter((r) => !r.hidden).every((r) => !r.wildcard)).toBe(true);
  });

  for (const rule of BASE_RULES) {
    it(`${rule.slug} fires exactly once`, () => {
      const db = makeDb();
      const w = seedWorld(db);
      const player = makePlayer(db);
      SCENARIOS[rule.slug]!(db, player.id, w);

      const first = checkBaseAchievements(db, player.id);
      expect(first.map((g) => g.slug)).toContain(rule.slug);
      // Idempotent: nothing new on a second and third sweep.
      expect(checkBaseAchievements(db, player.id)).toEqual([]);
      checkBaseAchievements(db, player.id);

      const rows = granted(db, player.id).filter((a) => a.slug === rule.slug);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.source).toBe("base");
      expect(rows[0]!.hidden).toBe(rule.hidden);
      expect(rows[0]!.revealedAt).toBeNull();
      expect(rows[0]!.flavor).toBe(rule.flavor.cartographer);
      const logged = eventsForPlayer(db, player.id).filter(
        (e) => e.verb === "grant_achievement" && String(e.data).includes(`"slug":"${rule.slug}"`),
      );
      expect(logged).toHaveLength(1);
      // Every achievement carries a box; hidden ones always add a functional item.
      const items = itemsByAchievement(db, player.id, [rows[0]!.id]).get(rows[0]!.id) ?? [];
      expect(items.length).toBeGreaterThanOrEqual(1);
      if (rule.hidden) expect(items.length).toBe(2);
    });
  }

  it("does not fire on an empty or merely-opened log", () => {
    const db = makeDb();
    const w = seedWorld(db);
    const player = makePlayer(db);
    expect(checkBaseAchievements(db, player.id)).toEqual([]);
    open(db, player.id, w.all[0]!, NOON);
    expect(checkBaseAchievements(db, player.id).map((g) => g.slug)).toEqual(["first-open"]);
  });

  it("a comeback needs three misses on the same node before the pass", () => {
    const db = makeDb();
    const w = seedWorld(db);
    const player = makePlayer(db);
    fail(db, player.id, w.all[0]!, NOON);
    fail(db, player.id, w.all[1]!, NOON);
    fail(db, player.id, w.all[2]!, NOON);
    pass(db, player.id, w.all[0]!, NOON);
    expect(checkBaseAchievements(db, player.id).map((g) => g.slug)).not.toContain("comeback");
  });

  it("wildcard ids ride in the stored data", () => {
    const db = makeDb();
    const w = seedWorld(db);
    const player = makePlayer(db);
    SCENARIOS["night-owl"]!(db, player.id, w);
    checkBaseAchievements(db, player.id);
    const row = granted(db, player.id).find((a) => a.slug === "night-owl")!;
    expect(JSON.parse(row.data!).wildcard).toBe("night-watch");
  });

  it("flavor follows the player's persona", () => {
    const db = makeDb();
    const w = seedWorld(db);
    const player = makePlayer(db, "kid@x.y", "protege");
    open(db, player.id, w.all[0]!, NOON);
    checkBaseAchievements(db, player.id);
    const flavor = granted(db, player.id)[0]!.flavor;
    expect(flavor).toBe(BASE_RULES.find((r) => r.slug === "first-open")!.flavor.protege);
  });
});

describe("loot", () => {
  it("is a pure seeded roll: same seed, same box", () => {
    const a = rollLoot("1:first-open", []);
    expect(rollLoot("1:first-open", [])).toEqual(a);
    const seeds = Array.from({ length: 40 }, (_, i) => JSON.stringify(rollLoot(`1:s${i}`, [])));
    expect(new Set(seeds).size).toBeGreaterThan(5);
  });

  it("draws one cosmetic from the pool, and about a quarter of boxes add a functional item", () => {
    const ids = new Set<string>(LOOT.cosmetics.map((c) => c.ref));
    let functional = 0;
    for (let i = 0; i < 400; i += 1) {
      const drops = rollLoot(`7:slug-${i}`, []);
      expect(ids.has(drops[0]!.ref!)).toBe(true);
      expect(drops.length).toBeLessThanOrEqual(2);
      if (drops.length === 2) {
        functional += 1;
        expect(["respec_token", "fog_reveal", "rare_node_key"]).toContain(drops[1]!.kind);
      }
    }
    expect(functional / 400).toBeGreaterThan(0.18);
    expect(functional / 400).toBeLessThan(0.32);
  });

  it("uses exactly the agreed cosmetic ids", () => {
    expect(LOOT.cosmetics.map((c) => c.ref).sort()).toEqual(
      [
        "aura-spark",
        "cape-scholar",
        "frame-brass",
        "frame-ivy",
        "frame-oak",
        "frame-stellar",
        "hair-laurel",
        "item-lantern",
        "style-botanical",
        "style-night",
        "style-parchment",
      ].sort(),
    );
  });

  it("never repeats an owned cosmetic; an exhausted pool pays a respec token", () => {
    const all = LOOT.cosmetics.map((c) => c.ref);
    for (let i = 0; i < 30; i += 1) {
      const owned = all.slice(0, 10);
      expect(rollLoot(`2:x${i}`, owned)[0]!.ref).toBe(all[10]);
    }
    expect(rollLoot("2:full", all)[0]).toEqual({ kind: "respec_token", ref: null });
  });

  it("hidden achievements always add a functional item", () => {
    for (let i = 0; i < 50; i += 1) {
      expect(rollLoot(`3:h${i}`, [], { hidden: true })).toHaveLength(2);
    }
  });

  it("granting is deterministic across databases and dedupes against owned items", () => {
    const run = () => {
      const db = makeDb();
      const player = makePlayer(db);
      const g1 = grantAchievement(db, player.id, {
        slug: "a-one",
        title: "A",
        flavor: "f",
        source: "model",
        hidden: true,
      })!;
      const g2 = grantAchievement(db, player.id, {
        slug: "a-two",
        title: "B",
        flavor: "f",
        source: "model",
        hidden: false,
      })!;
      expect(grantAchievement(db, player.id, { slug: "a-one", title: "A", flavor: "f", source: "model", hidden: true })).toBeNull();
      const cosmetics = [...g1.items, ...g2.items]
        .filter((i) => i.ref)
        .map((i) => i.ref);
      expect(new Set(cosmetics).size).toBe(cosmetics.length);
      const rows = db
        .select()
        .from(schema.atlasItems)
        .where(and(eq(schema.atlasItems.playerId, player.id)))
        .all();
      return rows.map((r) => `${r.kind}:${r.ref}`);
    };
    expect(run()).toEqual(run());
  });
});
