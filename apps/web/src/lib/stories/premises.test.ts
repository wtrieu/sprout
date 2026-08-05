import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "../../db/schema";
import type { DB } from "../../db/client";
import { ageBand } from "../skills/storyText";
import {
  PremiseSchema,
  expireStalePremises,
  normalizePremise,
  selectPremises,
  stalePremiseRows,
  type SelectablePremise,
  type SelectionContext,
} from "./premises";

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

const emptyCtx = (rand = () => 0.5): SelectionContext => ({
  recentBooks: [],
  recentPicks: [],
  rand,
});

const p = (
  lane: string,
  tags: string[],
  lesson: SelectablePremise["lesson"] = "none",
): SelectablePremise => ({ lane, tags, lesson });

describe("selectPremises", () => {
  it("spreads picks across lanes instead of repeating one", () => {
    const pool = [
      p("funny", ["hats"]),
      p("funny", ["soup"]),
      p("funny", ["socks"]),
      p("little-quest", ["mud"]),
      p("pourquoi", ["moon"]),
      p("folk-tale", ["fox"]),
    ];
    const picked = selectPremises(pool, 4, emptyCtx());
    const lanes = new Set(picked.map((x) => x.lane));
    expect(picked).toHaveLength(4);
    expect(lanes.size).toBe(4);
  });

  it("avoids lanes the recent library is saturated with", () => {
    const pool = [p("bedtime-winddown", ["stars"]), p("funny", ["soup"])];
    const picked = selectPremises(pool, 1, {
      ...emptyCtx(),
      recentBooks: [
        { lane: "bedtime-winddown", tags: [] },
        { lane: "bedtime-winddown", tags: [] },
        { lane: "bedtime-winddown", tags: [] },
      ],
    });
    expect(picked[0].lane).toBe("funny");
  });

  it("enforces the lesson dial at ~1/3 while no-lesson premises remain", () => {
    const pool = [
      p("folk-tale", ["a"], "cultural"),
      p("pourquoi", ["b"], "factual"),
      p("little-quest", ["c"], "developmental"),
      p("funny", ["d"]),
      p("everyday-wonder", ["e"]),
      p("myth-retelling", ["f"], "cultural"),
      p("history-vignette", ["g"]),
      p("bedtime-winddown", ["h"]),
    ];
    const picked = selectPremises(pool, 6, emptyCtx());
    const withLesson = picked.filter((x) => x.lesson !== "none").length;
    expect(withLesson).toBeLessThanOrEqual(2); // floor(6/3)
  });

  it("falls back to lesson premises when nothing else is left", () => {
    const pool = [p("folk-tale", ["a"], "cultural"), p("pourquoi", ["b"], "factual")];
    const picked = selectPremises(pool, 2, emptyCtx());
    expect(picked).toHaveLength(2);
  });

  it("boosts an under-served north star and suppresses an over-served one", () => {
    const culture = { label: "Taiwanese culture", share: 0.2, tags: ["taiwanese"] };
    // Window empty → culture is under target → culture premise wins.
    const pool = [p("folk-tale", ["taiwanese"]), p("folk-tale", ["fox"])];
    const under = selectPremises(pool, 1, { ...emptyCtx(), northStars: [culture] });
    expect(under[0].tags).toContain("taiwanese");

    // Window already at/above 20% culture → the unconstrained premise wins.
    const saturatedWindow = Array.from({ length: 15 }, (_, i) =>
      p("folk-tale", i < 5 ? ["taiwanese"] : ["other"]),
    );
    const over = selectPremises(pool, 1, {
      ...emptyCtx(),
      recentPicks: saturatedWindow,
      northStars: [culture],
    });
    expect(over[0].tags).toContain("fox");
  });

  it("keeps a simulated week of picks near the target share without whole-batch capture", () => {
    const culture = { label: "culture", share: 0.2, tags: ["taiwanese"] };
    const window: SelectablePremise[] = [];
    let cultureTouched = 0;
    let total = 0;
    let seed = 42;
    const rand = () => {
      // deterministic LCG so the test can't flake
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let night = 0; night < 7; night++) {
      const pool = [
        p("folk-tale", ["taiwanese", "festival"], night % 2 === 0 ? "cultural" : "none"),
        p("myth-retelling", ["taiwanese", "moon"]),
        p("funny", ["soup"]),
        p("little-quest", ["mud"]),
        p("pourquoi", ["stars"]),
        p("everyday-wonder", ["rain"]),
        p("history-vignette", ["flight"]),
        p("bedtime-winddown", ["night"]),
      ];
      const picked = selectPremises(pool, 4, {
        recentBooks: [],
        recentPicks: window.slice(-15),
        northStars: [culture],
        rand,
      });
      expect(picked.every((x) => x.tags.includes("taiwanese"))).toBe(false);
      for (const pick of picked) {
        window.push(pick);
        total += 1;
        if (pick.tags.includes("taiwanese")) cultureTouched += 1;
      }
    }
    const shareSeen = cultureTouched / total;
    expect(shareSeen).toBeGreaterThan(0.1);
    expect(shareSeen).toBeLessThan(0.35);
  });
});

describe("normalizePremise", () => {
  const band = ageBand(24);
  const base = PremiseSchema.parse({
    title: "The Grumpy Cloud",
    lane: "funny",
    pitch: "A small cloud refuses to rain on exactly the wrong day, and everything gets sillier.",
    tags: ["Weather", "clouds", "weather"],
    lesson: "developmental",
    lessonNote: "patience",
    form: "no-such-form",
    lengthPages: 20,
  });

  it("forces no-lesson in the funny lane and clamps length to the band", () => {
    const n = normalizePremise(base, band);
    expect(n.lesson).toBe("none");
    expect(n.lessonNote).toBeUndefined();
    expect(n.lengthPages).toBe(band.maxPages);
    expect(n.form).toBeUndefined();
    expect(n.tags).toEqual(["weather", "clouds"]);
  });

  it("falls back to everyday-wonder for unknown lanes and drops unknown seeds", () => {
    const n = normalizePremise(
      { ...base, lane: "space-opera", seedRef: "unknown-seed" },
      band,
    );
    expect(n.lane).toBe("everyday-wonder");
    expect(n.seedRef).toBeUndefined();
  });

  it("keeps a known form and a known seed", () => {
    const n = normalizePremise(
      { ...base, lane: "folk-tale", form: "refrain", seedRef: "zodiac-race" },
      band,
      new Set(["zodiac-race"]),
    );
    expect(n.form).toBe("refrain");
    expect(n.seedRef).toBe("zodiac-race");
  });
});

describe("auto-pick fallback plumbing", () => {
  let db: DB;
  let childId: number;

  beforeEach(() => {
    db = makeDb();
    childId = db
      .insert(schema.children)
      .values({ name: "Jun", dob: "2024-08-01" })
      .returning()
      .get().id;
  });

  const insertPremise = (ageHours: number, status = "proposed" as const) =>
    db
      .insert(schema.premises)
      .values({
        childId,
        title: `premise ${ageHours}h old`,
        lane: "little-quest",
        pitch: "A snail sets out to find the perfect leaf and comes home wiser.",
        tags: ["snail"],
        lengthPages: 8,
        status,
        createdAt: new Date(Date.now() - ageHours * 3600 * 1000),
      })
      .returning()
      .get();

  it("finds only premises older than the auto-pick window", () => {
    insertPremise(2);
    const old = insertPremise(50);
    const stale = stalePremiseRows(db, 48);
    expect(stale.map((r) => r.id)).toEqual([old.id]);
  });

  it("expires premises that sat unpicked past the expiry window", () => {
    const ancient = insertPremise(8 * 24);
    const fresh = insertPremise(2);
    const expired = expireStalePremises(db);
    expect(expired).toBe(1);
    const row = db
      .select()
      .from(schema.premises)
      .where(eq(schema.premises.id, ancient.id))
      .get()!;
    expect(row.status).toBe("passed");
    expect(row.passReason).toBe("expired");
    const freshRow = db
      .select()
      .from(schema.premises)
      .where(eq(schema.premises.id, fresh.id))
      .get()!;
    expect(freshRow.status).toBe("proposed");
  });
});
