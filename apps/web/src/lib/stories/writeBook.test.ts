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
  hiddenFriend: "a ladybird with one missing spot, always mid-errand",
  pages: Array.from({ length: 8 }, (_, i) => ({
    text: `Nib slid along the garden wall, slow and steady. (page ${i + 1})`,
    scene: `a garden wall in morning light, the snail gliding along the top, dew shining, page ${i + 1}`,
    background: `beyond the wall, a robin gathering straw for a slowly growing nest, page ${i + 1}`,
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
    expect(story.engineVersion).toBe(3);
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

  it("composes background and hidden friend into every page's illustration prompt", () => {
    const { call } = makeFakeCall({});
    const result = writeBookForPremise(db, premiseRow, { call, log: () => {} });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const pages = db.select().from(schema.storyPages).all();
    expect(pages.length).toBeGreaterThan(0);
    for (const page of pages) {
      expect(page.illustrationPrompt).toContain("in the background, beyond the wall");
      expect(page.illustrationPrompt).toContain("tucked somewhere tiny");
      expect(page.illustrationPrompt).toContain("ladybird");
    }
    const story = db.select().from(schema.stories).all()[0];
    expect(story.artNotes).toContain("hidden friend");
  });

  it("repairs a draft missing the illustration layers, and imports even if still thin", () => {
    const { hiddenFriend: _hf, ...flatBook } = goodBook;
    const thinBook = {
      ...flatBook,
      pages: goodBook.pages.map(({ text, scene }) => ({ text, scene })),
    };
    let repairPrompt = "";
    const { call, calls } = makeFakeCall({
      book: (prompt, nth) => {
        if (nth === 1) repairPrompt = prompt;
        return thinBook; // still thin after repair — must import anyway
      },
    });
    const result = writeBookForPremise(db, premiseRow, { call, log: () => {} });
    expect(result.ok).toBe(true);
    expect(calls.filter((c) => c.kind === "book")).toHaveLength(2);
    expect(repairPrompt).toContain("hiddenFriend");
    expect(repairPrompt).toContain("background");
  });

  it("asks for one trim pass when art fields blow their word budgets, then imports regardless", () => {
    const ramble = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");
    const bloated = {
      ...goodBook,
      characterDesc: ramble(38),
      pages: goodBook.pages.map((p) => ({ ...p, scene: ramble(40), background: ramble(30) })),
    };
    let repairPrompt = "";
    const { call, calls } = makeFakeCall({
      book: (prompt, nth) => {
        if (nth === 1) repairPrompt = prompt;
        return bloated; // still bloated after repair — must import anyway
      },
    });
    const result = writeBookForPremise(db, premiseRow, { call, log: () => {} });
    expect(result.ok).toBe(true);
    expect(calls.filter((c) => c.kind === "book")).toHaveLength(2);
    expect(repairPrompt).toContain("trim to 28 or fewer");
    expect(repairPrompt).toContain('"scene" over 25 words');
    expect(repairPrompt).toContain('"background" over 18 words');
  });

  it("adds the factAccuracy rubric only for nonfiction-lane books", () => {
    db.update(schema.premises)
      .set({ lane: "animal-lives", lesson: "factual" })
      .where(eq(schema.premises.id, premiseRow.id))
      .run();
    const nonfiction = db
      .select()
      .from(schema.premises)
      .where(eq(schema.premises.id, premiseRow.id))
      .get()!;
    let judgePrompt = "";
    let bookPrompt = "";
    const { call } = makeFakeCall({
      book: (prompt) => {
        if (!bookPrompt) bookPrompt = prompt;
        return goodBook;
      },
      judge: (prompt) => {
        judgePrompt = prompt;
        return approveVerdict;
      },
    });
    const result = writeBookForPremise(db, nonfiction, { call, log: () => {} });
    expect(result.ok).toBe(true);
    expect(judgePrompt).toContain("factAccuracy");
    expect(bookPrompt).toContain("NONFICTION");

    // …and a fiction lane gets neither.
    db.update(schema.premises)
      .set({ lane: "little-quest", lesson: "none", status: "greenlit", storyId: null })
      .where(eq(schema.premises.id, premiseRow.id))
      .run();
    const fiction = db
      .select()
      .from(schema.premises)
      .where(eq(schema.premises.id, premiseRow.id))
      .get()!;
    judgePrompt = "";
    const result2 = writeBookForPremise(db, fiction, { call, log: () => {} });
    expect(result2.ok).toBe(true);
    expect(judgePrompt).not.toContain("factAccuracy");
  });
});
