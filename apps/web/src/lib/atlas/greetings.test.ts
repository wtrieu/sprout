import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { describe, expect, it } from "vitest";
import * as schema from "../../db/schema";
import type { DB } from "../../db/client";
import {
  MapGreetingsSchema,
  buildGreetingsPrompt,
  draftMapGreetings,
  greetingsFor,
  mapsMissingGreetings,
} from "./greetings";
import type { AtlasLlm } from "./llm";

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../db/migrations",
);

const makeDb = (): DB => {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema }) as unknown as DB;
  migrate(db, { migrationsFolder });
  return db;
};

const BREAD = {
  cartographer: [
    "The sourdough drawer is fermenting again. I've filed a complaint with the yeast.",
    "My ledger for Gluten networks has more stretch marks than the dough itself.",
    "Oven spring: the only rise I've ever approved without a second signature.",
    "Someone left flour in the Milling margins. I am choosing to call it field evidence.",
  ],
  protege: [
    "I tried to make a starter. It started nothing. Is that a different kind of starter?",
    "Gluten networks sound like a social club for sandwiches. Can I join?",
    "I watched the dough rise for an hour. It didn't wave back. Rude, but impressive.",
    "Is a croissant just bread that went to finishing school?",
  ],
};

const seedMap = (db: DB, title = "Bread") => {
  const map = db.insert(schema.atlasMaps).values({ title, blurb: "Flour, water, time.", status: "ready" }).returning().get();
  const branch = db
    .insert(schema.atlasNodes)
    .values({ mapId: map.id, parentId: null, position: 0, title: "Fermentation", blurb: "Why does dough rise?", kind: "branch" })
    .returning()
    .get();
  db.insert(schema.atlasNodes)
    .values({ mapId: map.id, parentId: branch.id, position: 0, title: "Wild yeast", blurb: "What lives in a starter?", kind: "concept" })
    .run();
  return map;
};

describe("greetingsFor", () => {
  it("reads one persona's lines; missing or malformed columns read as none", () => {
    expect(greetingsFor(JSON.stringify(BREAD), "protege")).toEqual(BREAD.protege);
    expect(greetingsFor(JSON.stringify(BREAD), "cartographer")).toEqual(BREAD.cartographer);
    expect(greetingsFor(null, "protege")).toEqual([]);
    expect(greetingsFor("not json", "protege")).toEqual([]);
    expect(greetingsFor(JSON.stringify({ protege: ["too few"] }), "protege")).toEqual([]);
  });

  it("the schema rejects markup and placeholders that would render verbatim", () => {
    const bad = { ...BREAD, protege: [...BREAD.protege.slice(1), "Back to {mapTitle}! Let's go."] };
    expect(MapGreetingsSchema.safeParse(bad).success).toBe(false);
    expect(MapGreetingsSchema.safeParse(BREAD).success).toBe(true);
  });
});

describe("buildGreetingsPrompt", () => {
  it("shows the field and its tree, both voices, and the house rules", () => {
    const prompt = buildGreetingsPrompt({
      title: "Bread",
      blurb: "Flour, water, time.",
      branches: [{ title: "Fermentation", children: ["Wild yeast", "Oven spring"] }],
    });
    expect(prompt).toContain("MAP: Bread — Flour, water, time.");
    expect(prompt).toContain("- Fermentation: Wild yeast, Oven spring");
    expect(prompt).toMatch(/cartographer —/);
    expect(prompt).toMatch(/protege —/);
    expect(prompt).toMatch(/never on the player/);
    expect(prompt).toMatch(/Family-friendly/);
  });
});

describe("draftMapGreetings", () => {
  it("drafts once from the map's tree and stores the lines", () => {
    const db = makeDb();
    const map = seedMap(db);
    const prompts: string[] = [];
    const llm: AtlasLlm = (prompt, zschema) => {
      prompts.push(prompt);
      return zschema.parse(BREAD);
    };
    expect(draftMapGreetings(db, map.id, { llm, log: () => {} })).toEqual({ ok: true, status: "drafted", count: 8 });
    expect(prompts[0]).toContain("- Fermentation: Wild yeast");
    const row = db.select().from(schema.atlasMaps).where(eq(schema.atlasMaps.id, map.id)).get();
    expect(greetingsFor(row?.greetings, "protege")).toEqual(BREAD.protege);

    // Already drafted: no second call unless forced.
    expect(draftMapGreetings(db, map.id, { llm, log: () => {} })).toEqual({ ok: true, status: "exists" });
    expect(prompts).toHaveLength(1);
    expect(draftMapGreetings(db, map.id, { llm, log: () => {}, force: true }).ok).toBe(true);
    expect(prompts).toHaveLength(2);
  });

  it("a failed call leaves the column null and reports the error", () => {
    const db = makeDb();
    const map = seedMap(db);
    const llm: AtlasLlm = () => {
      throw new Error("map greetings: response failed validation twice");
    };
    const res = draftMapGreetings(db, map.id, { llm, log: () => {} });
    expect(res).toEqual({ ok: false, error: "map greetings: response failed validation twice" });
    const row = db.select().from(schema.atlasMaps).where(eq(schema.atlasMaps.id, map.id)).get();
    expect(row?.greetings).toBeNull();
  });

  it("a map with no nodes, or no map at all, is an error without a call", () => {
    const db = makeDb();
    const empty = db.insert(schema.atlasMaps).values({ title: "Empty", status: "drafting" }).returning().get();
    const llm: AtlasLlm = () => {
      throw new Error("should not be called");
    };
    expect(draftMapGreetings(db, empty.id, { llm, log: () => {} }).ok).toBe(false);
    expect(draftMapGreetings(db, 999, { llm, log: () => {} }).ok).toBe(false);
  });

  it("the backfill list is ready maps without greetings", () => {
    const db = makeDb();
    const bread = seedMap(db, "Bread");
    const stars = seedMap(db, "Stars");
    db.insert(schema.atlasMaps).values({ title: "Still drafting", status: "drafting" }).run();
    db.update(schema.atlasMaps).set({ greetings: JSON.stringify(BREAD) }).where(eq(schema.atlasMaps.id, bread.id)).run();
    expect(mapsMissingGreetings(db)).toEqual([stars.id]);
  });
});
