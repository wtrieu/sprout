import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "../../db/schema";
import type { DB } from "../../db/client";
import { importCandidate } from "./importCandidate";

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

const goodCandidate = {
  title: "The Sleepy Meadow",
  characterName: "Bram",
  characterDesc:
    "a small round badger cub with charcoal-grey fur, a white striped snout, and a tiny mustard-yellow scarf",
  pages: Array.from({ length: 8 }, (_, i) => ({
    text: `Bram pads through the meadow. Hush, hush, the grass whispers back. (page ${i + 1})`,
    scene: `wide meadow at dusk, the badger cub walking between tall grasses, warm fading light, page ${i + 1}`,
  })),
};

describe("importCandidate", () => {
  let db: DB;
  let childId: number;

  beforeEach(() => {
    db = makeDb();
    childId = db
      .insert(schema.children)
      .values({ name: "Juniper", dob: "2024-01-15" })
      .returning()
      .get().id;
  });

  const opts = () => ({
    childId,
    ageMonths: 24,
    formKey: "rhythmic-prose",
    artPackKey: "watercolor-soft",
    theme: "test theme",
  });

  it("rejects malformed shapes with readable problems", () => {
    const result = importCandidate(db, { title: "x" }, opts());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems.length).toBeGreaterThan(0);
  });

  it("rejects pages that blow the age-band word budget", () => {
    const wordy = {
      ...goodCandidate,
      pages: goodCandidate.pages.map((p) => ({
        ...p,
        text: Array.from({ length: 45 }, (_, i) => `w${i}`).join(" "),
      })),
    };
    const result = importCandidate(db, wordy, opts());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems[0]).toMatch(/words/);
  });

  it("imports a valid candidate as a draft with composed prompts", () => {
    const result = importCandidate(db, goodCandidate, opts());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const story = db
      .select()
      .from(schema.stories)
      .where(eq(schema.stories.id, result.storyId))
      .get()!;
    expect(story.status).toBe("draft");
    expect(story.characterName).toBe("Bram");
    expect(story.pageCount).toBe(8);
    expect(story.artNotes).toContain("--cref");

    const pages = db
      .select()
      .from(schema.storyPages)
      .where(eq(schema.storyPages.storyId, result.storyId))
      .orderBy(asc(schema.storyPages.pageIndex))
      .all();
    expect(pages).toHaveLength(8);
    for (const page of pages) {
      // Every prompt is self-contained: style DNA + character + scene + negatives.
      expect(page.illustrationPrompt).toContain("badger cub");
      expect(page.illustrationPrompt).toContain("--ar 3:2");
      expect(page.illustrationPrompt).toContain("--no text");
      expect(page.illustrationPrompt).toContain("watercolor");
    }
  });

  it("enforces lullaby-rhyme couplets against the rhyme bank", () => {
    const notRhyming = {
      ...goodCandidate,
      pages: goodCandidate.pages.map(() => ({
        text: "The meadow hums a quiet tune / the badger dreams of cheese",
        scene: "meadow at night under a large moon, badger curled asleep in the grass",
      })),
    };
    const result = importCandidate(db, notRhyming, { ...opts(), formKey: "lullaby-rhyme" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems[0]).toMatch(/RHYME BANK/);
  });
});
