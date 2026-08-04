import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "../../db/schema";
import type { DB } from "../../db/client";
import { writeBookForPremise, type JudgeVerdict } from "./writeBook";
import type { CallClaude } from "./claudeCli";

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

// dob ≈ 24 months ago → 18-30mo band (8-10 pages, 32 words/page).
const dob = new Date(Date.now() - 730 * 86400 * 1000).toISOString().slice(0, 10);

const goodBook = {
  title: "The Snail's Leaf",
  characterName: "Nib",
  characterDesc:
    "a small garden snail with a swirly caramel shell, soft grey body, and a tiny red knitted cap",
  pages: Array.from({ length: 8 }, (_, i) => ({
    text: `Nib slid along the garden wall, slow and steady. (page ${i + 1})`,
    scene: `a garden wall in morning light, the snail gliding along the top, dew shining, page ${i + 1}`,
  })),
};

const approveVerdict: JudgeVerdict = {
  verdict: "approve",
  coherence: "holds together",
  freshness: "new ground",
  readAloud: "smooth",
  ageFit: "right",
  fixes: [],
};

/** Fake CLI keyed on prompt markers; records every call's model + kind. */
const makeFakeCall = (handlers: {
  book?: (prompt: string, nthBookCall: number) => unknown;
  judge?: (prompt: string) => unknown;
}) => {
  const calls: { kind: "book" | "judge"; model: string }[] = [];
  let bookCalls = 0;
  const call: CallClaude = (prompt, opts) => {
    const isJudge = prompt.includes("in-house editor");
    calls.push({ kind: isJudge ? "judge" : "book", model: opts.model });
    const payload = isJudge
      ? (handlers.judge ?? (() => approveVerdict))(prompt)
      : (handlers.book ?? (() => goodBook))(prompt, bookCalls++);
    return JSON.stringify(payload);
  };
  return { call, calls };
};

describe("writeBookForPremise", () => {
  let db: DB;
  let premiseRow: typeof schema.premises.$inferSelect;

  beforeEach(() => {
    db = makeDb();
    const childId = db
      .insert(schema.children)
      .values({ name: "Jun", dob })
      .returning()
      .get().id;
    premiseRow = db
      .insert(schema.premises)
      .values({
        childId,
        title: "The Snail's Leaf",
        lane: "little-quest",
        pitch: "A garden snail wants one perfect leaf for its windowsill and sets out to find it.",
        tags: ["snail", "garden"],
        lesson: "none",
        lengthPages: 8,
        status: "greenlit",
      })
      .returning()
      .get();
  });

  it("writes, judges, imports, and stamps lane/tags/engine on the story", () => {
    const { call, calls } = makeFakeCall({});
    const result = writeBookForPremise(db, premiseRow, { call, log: () => {} });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const story = db
      .select()
      .from(schema.stories)
      .where(eq(schema.stories.id, result.storyId))
      .get()!;
    expect(story.status).toBe("draft");
    expect(story.lane).toBe("little-quest");
    expect(story.tags).toEqual(["snail", "garden"]);
    expect(story.lesson).toBe("none");
    expect(story.engineVersion).toBe(2);
    expect(story.premiseId).toBe(premiseRow.id);

    const premise = db
      .select()
      .from(schema.premises)
      .where(eq(schema.premises.id, premiseRow.id))
      .get()!;
    expect(premise.status).toBe("written");
    expect(premise.storyId).toBe(result.storyId);

    // Model pinning: writer and judge are different, explicitly set models.
    expect(calls.map((c) => c.kind)).toEqual(["book", "judge"]);
    expect(calls[0].model).toBe("claude-fable-5");
    expect(calls[1].model).toBe("claude-sonnet-5");
  });

  it("repairs once on mechanical problems, then imports", () => {
    const wall = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");
    const { call, calls } = makeFakeCall({
      book: (_prompt, nth) =>
        nth === 0
          ? { ...goodBook, pages: goodBook.pages.map((p) => ({ ...p, text: wall })) }
          : goodBook,
    });
    const result = writeBookForPremise(db, premiseRow, { call, log: () => {} });
    expect(result.ok).toBe(true);
    expect(calls.filter((c) => c.kind === "book")).toHaveLength(2);
  });

  it("stores the verdict and rejects the premise when the judge rejects", () => {
    const { call } = makeFakeCall({
      judge: () => ({
        ...approveVerdict,
        verdict: "reject",
        coherence: "the leaf plot evaporates on page 4",
      }),
    });
    const result = writeBookForPremise(db, premiseRow, { call, log: () => {} });
    expect(result.ok).toBe(false);

    const premise = db
      .select()
      .from(schema.premises)
      .where(eq(schema.premises.id, premiseRow.id))
      .get()!;
    expect(premise.status).toBe("rejected");
    expect(premise.judgeVerdict).toContain("evaporates");
    expect(db.select().from(schema.stories).all()).toHaveLength(0);
  });

  it("runs exactly one revision pass when the judge asks for fixes", () => {
    const revisedBook = { ...goodBook, title: "The Snail's Perfect Leaf" };
    const { call, calls } = makeFakeCall({
      book: (_prompt, nth) => (nth === 0 ? goodBook : revisedBook),
      judge: () => ({ ...approveVerdict, verdict: "revise", fixes: ["sharpen the ending"] }),
    });
    const result = writeBookForPremise(db, premiseRow, { call, log: () => {} });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(calls.map((c) => c.kind)).toEqual(["book", "judge", "book"]);
    expect(result.title).toBe("The Snail's Perfect Leaf");
  });

  it("keeps the approved draft when the revision comes back broken", () => {
    const { call } = makeFakeCall({
      book: (_prompt, nth) => (nth === 0 ? goodBook : { garbage: true }),
      judge: () => ({ ...approveVerdict, verdict: "revise", fixes: ["sharpen the ending"] }),
    });
    const result = writeBookForPremise(db, premiseRow, { call, log: () => {} });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.title).toBe("The Snail's Leaf");
  });

  it("feeds seed bones + romanized vocab into the book prompt when the premise has a seed", () => {
    db.update(schema.premises)
      .set({ seedRef: "change-jade-rabbit", lane: "myth-retelling" })
      .where(eq(schema.premises.id, premiseRow.id))
      .run();
    const seeded = db
      .select()
      .from(schema.premises)
      .where(eq(schema.premises.id, premiseRow.id))
      .get()!;
    let bookPrompt = "";
    const { call } = makeFakeCall({
      book: (prompt) => {
        if (!bookPrompt) bookPrompt = prompt;
        return goodBook;
      },
    });
    const result = writeBookForPremise(db, seeded, { call, log: () => {} });
    expect(result.ok).toBe(true);
    expect(bookPrompt).toContain("SOURCE MATERIAL");
    expect(bookPrompt).toContain("Jade Rabbit");
    expect(bookPrompt).toContain("yuèliang");
    // Romanization only — the stored script never reaches a prompt.
    expect(bookPrompt).not.toMatch(/[一-鿿]/);
  });

  it("imports the draft unjudged when the judge itself breaks", () => {
    const { call } = makeFakeCall({
      judge: () => {
        throw new Error("judge model offline");
      },
    });
    const result = writeBookForPremise(db, premiseRow, { call, log: () => {} });
    expect(result.ok).toBe(true);
  });
});
