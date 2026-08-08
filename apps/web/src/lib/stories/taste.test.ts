import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as schema from "../../db/schema";
import type { DB } from "../../db/client";
import type { CallClaude } from "./claudeCli";
import {
  MEMO_MAX_LINES,
  compressRejectedStories,
  distillTaste,
  readTasteMemo,
} from "./taste";

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

let db: DB;
let childId: number;
let memoPath: string;

beforeEach(() => {
  db = makeDb();
  childId = db
    .insert(schema.children)
    .values({ name: "Jun", dob: "2024-08-01" })
    .returning()
    .get().id;
  memoPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "taste-")), "editorial-taste.md");
  process.env.EDITORIAL_TASTE_PATH = memoPath;
});

afterEach(() => {
  delete process.env.EDITORIAL_TASTE_PATH;
});

const insertStory = (over: Partial<typeof schema.stories.$inferInsert> = {}) => {
  const story = db
    .insert(schema.stories)
    .values({
      childId,
      title: "The Snail's Leaf",
      prompt: "a snail quest",
      ageMonths: 24,
      pageCount: 8,
      lane: "little-quest",
      tags: ["snail"],
      engineVersion: 2,
      status: "ready",
      ...over,
    })
    .returning()
    .get();
  db.insert(schema.storyPages)
    .values({
      storyId: story.id,
      pageIndex: 0,
      text: "Nib slid along the wall. The morning was new.",
      illustrationPrompt: "x",
    })
    .run();
  return story;
};

describe("distillTaste", () => {
  it("skips when there's too little signal", () => {
    insertStory();
    const result = distillTaste(db, () => {
      throw new Error("should not be called");
    });
    expect(result.distilled).toBe(false);
    expect(readTasteMemo()).toBe("");
  });

  it("distills a capped memo from the current engine's window only", () => {
    insertStory({ title: "Kept One", favorite: true });
    insertStory({ title: "Rejected One", status: "rejected", rejectReason: "samey" });
    insertStory({ title: "Rejected Two", status: "rejected", rejectReason: "too-preachy" });
    // Template-era story: must never reach the distiller prompt.
    insertStory({ title: "Croissant Era Relic", engineVersion: 1, status: "rejected" });

    let seenPrompt = "";
    const longMemo = Array.from({ length: 60 }, (_, i) => `line ${i + 1}`).join("\n");
    const call: CallClaude = (prompt) => {
      seenPrompt = prompt;
      return longMemo;
    };
    const result = distillTaste(db, call);
    expect(result.distilled).toBe(true);
    expect(seenPrompt).toContain("Kept One");
    expect(seenPrompt).toContain("Rejected One");
    expect(seenPrompt).not.toContain("Croissant Era Relic");

    const memo = readTasteMemo();
    expect(memo.split("\n")).toHaveLength(MEMO_MAX_LINES);
  });

  it("feeds premise passes and judge kills as signals", () => {
    db.insert(schema.premises)
      .values({
        childId,
        title: "Passed Pitch",
        lane: "funny",
        pitch: "A soup that sings show tunes at exactly the wrong moments.",
        tags: ["soup"],
        lengthPages: 8,
        status: "passed",
        passReason: "not-for-us",
      })
      .run();
    insertStory({ title: "A", status: "rejected", rejectReason: "clunky" });
    insertStory({ title: "B" });
    let seenPrompt = "";
    distillTaste(db, (prompt) => {
      seenPrompt = prompt;
      return "## More like this\n- warmth";
    });
    expect(seenPrompt).toContain("Passed Pitch");
    expect(seenPrompt).toContain("not-for-us");
  });

  it("ignores superseded clear-outs — a regime change is not taste", () => {
    insertStory({ title: "Kept One", favorite: true });
    insertStory({ title: "Kept Two" });
    insertStory({ title: "Real Reject", status: "rejected", rejectReason: "clunky" });
    insertStory({ title: "Cleared Draft", status: "rejected", rejectReason: "superseded" });
    db.insert(schema.premises)
      .values({
        childId,
        title: "Cleared Premise",
        lane: "funny",
        pitch: "An old-engine premise retired when v3 shipped, through no fault of its own.",
        tags: ["soup"],
        lengthPages: 8,
        status: "passed",
        passReason: "superseded",
      })
      .run();
    let seenPrompt = "";
    distillTaste(db, (prompt) => {
      seenPrompt = prompt;
      return "## More like this\n- warmth";
    });
    expect(seenPrompt).toContain("Real Reject");
    expect(seenPrompt).not.toContain("Cleared Draft");
    expect(seenPrompt).not.toContain("Cleared Premise");
  });
});

describe("compressRejectedStories", () => {
  it("compresses old rejected drafts to epitaphs and drops their pages", () => {
    const old = insertStory({
      title: "Old Reject",
      status: "rejected",
      rejectReason: "samey",
      createdAt: new Date(Date.now() - 100 * 86400 * 1000),
    });
    const recent = insertStory({ title: "Fresh Reject", status: "rejected" });

    expect(compressRejectedStories(db)).toBe(1);

    const compressed = db
      .select()
      .from(schema.stories)
      .where(eq(schema.stories.id, old.id))
      .get()!;
    expect(compressed.epitaph).toContain("Old Reject");
    expect(compressed.epitaph).toContain("samey");
    expect(compressed.epitaph).toContain("Nib slid along the wall");
    expect(
      db.select().from(schema.storyPages).where(eq(schema.storyPages.storyId, old.id)).all(),
    ).toHaveLength(0);

    // Fresh rejections keep their pages (still inside the evidence window).
    expect(
      db.select().from(schema.storyPages).where(eq(schema.storyPages.storyId, recent.id)).all(),
    ).toHaveLength(1);
    // Idempotent: already-compressed stories aren't re-processed.
    expect(compressRejectedStories(db)).toBe(0);
  });
});
