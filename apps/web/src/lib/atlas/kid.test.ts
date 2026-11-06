import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "../../db/schema";
import type { DB } from "../../db/client";
import { NONFICTION_FLOOR } from "../stories/lanes";
import {
  generateKidVersion,
  hasNonLatinLetters,
  kidWordBudget,
  listBookmarkViews,
  storyTopicForBookmark,
} from "./kid";
import { atlasModels, makeCliLlm, type AtlasLlm } from "./llm";

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

const NOW = new Date(2026, 10, 4, 12, 0);
const pad = (n: number) => String(n).padStart(2, "0");
/** An ISO dob that makes the child exactly `months` old on NOW (same day of month). */
const dobFor = (months: number): string => {
  const d = new Date(NOW.getFullYear(), NOW.getMonth() - months, NOW.getDate());
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const words = (n: number, w = "bridge") => Array.from({ length: n }, () => w).join(" ");

type Opts = { months?: number; note?: string | null; onepager?: "ready" | "drafting" | "none" };

const seed = (db: DB, opts: Opts = {}) => {
  const child = db
    .insert(schema.children)
    .values({ name: "Wren", dob: dobFor(opts.months ?? 40) })
    .returning()
    .get();
  const map = db
    .insert(schema.atlasMaps)
    .values({ title: "Engineering", status: "ready" })
    .returning()
    .get();
  const node = db
    .insert(schema.atlasNodes)
    .values({
      mapId: map.id,
      parentId: null,
      position: 0,
      title: "Suspension bridges",
      blurb: "How can a road hang from a rope?",
      kind: "concept",
    })
    .returning()
    .get();
  const onepager = opts.onepager ?? "ready";
  if (onepager !== "none") {
    db.insert(schema.atlasRungs)
      .values({
        nodeId: node.id,
        level: "onepager",
        status: onepager,
        bodyMd: "### The question\nCables carry the pull.\n\n[[visual:cable-diagram]]\n\n### Further reading\n- A link",
      })
      .run();
  }
  const bookmark = db
    .insert(schema.atlasBookmarks)
    .values({ nodeId: node.id, childId: child.id, note: opts.note ?? null })
    .returning()
    .get();
  return { child, map, node, bookmark };
};

/** A model that parses with the schema it is handed, like the real adapter's first pass. */
const parsing =
  (draft: { kid_md: string; today: string }, seen: string[] = []): AtlasLlm =>
  (prompt, zschema) => {
    seen.push(prompt);
    return zschema.parse(draft);
  };

/** A model that ignores the schema entirely — post-hoc validation must still hold. */
const lax =
  (draft: { kid_md: string; today: string }): AtlasLlm =>
  () =>
    draft as never;

const row = (db: DB, id: number) =>
  db.select().from(schema.atlasBookmarks).where(eq(schema.atlasBookmarks.id, id)).get()!;

describe("kidWordBudget", () => {
  it("steps up by age band", () => {
    expect(kidWordBudget(0)).toBe(60);
    expect(kidWordBudget(17)).toBe(60);
    expect(kidWordBudget(18)).toBe(90);
    expect(kidWordBudget(29)).toBe(90);
    expect(kidWordBudget(30)).toBe(130);
    expect(kidWordBudget(47)).toBe(130);
    expect(kidWordBudget(48)).toBe(180);
    expect(kidWordBudget(120)).toBe(180);
  });
});

describe("hasNonLatinLetters", () => {
  it("passes Latin text, accents, digits, punctuation and emoji", () => {
    expect(hasNonLatinLetters("Look at the café bridge, it's 3 cables long! 🌉 — wow")).toBe(false);
  });
  it("catches CJK, Cyrillic and Arabic", () => {
    expect(hasNonLatinLetters("The 桥 is tall")).toBe(true);
    expect(hasNonLatinLetters("Мост is a bridge")).toBe(true);
    expect(hasNonLatinLetters("جسر")).toBe(true);
  });
});

describe("generateKidVersion", () => {
  it.each([
    { months: 12, budget: 60 },
    { months: 24, budget: 90 },
    { months: 40, budget: 130 },
    { months: 60, budget: 180 },
  ])("enforces the $budget-word budget for a $months-month-old", async ({ months, budget }) => {
    const okDb = makeDb();
    const ok = seed(okDb, { months });
    const done = await generateKidVersion(okDb, ok.bookmark.id, {
      llm: parsing({ kid_md: words(budget), today: "Find something that hangs." }),
      now: NOW,
      log: () => {},
    });
    expect(done.ok).toBe(true);
    expect(row(okDb, ok.bookmark.id).kidStatus).toBe("ready");

    const overDb = makeDb();
    const over = seed(overDb, { months });
    const failed = await generateKidVersion(overDb, over.bookmark.id, {
      llm: lax({ kid_md: words(budget + 1), today: "Find something that hangs." }),
      now: NOW,
      log: () => {},
    });
    expect(failed.ok).toBe(false);
    const r = row(overDb, over.bookmark.id);
    expect(r.kidStatus).toBe("failed");
    expect(r.kidError).toContain(`the limit is ${budget}`);
    expect(r.kidMd).toBeNull();
  });

  it("fails a today line over 40 words", async () => {
    const db = makeDb();
    const { bookmark } = seed(db);
    const res = await generateKidVersion(db, bookmark.id, {
      llm: lax({ kid_md: "Cables hold the road up.", today: words(41, "rope") }),
      now: NOW,
      log: () => {},
    });
    expect(res.ok).toBe(false);
    expect(row(db, bookmark.id).kidError).toContain("today is 41 words");
  });

  it("rejects non-Latin output even from a model that skips the schema", async () => {
    for (const bad of ["桥很高 the bridge is tall", "Мост высокий and strong"]) {
      const db = makeDb();
      const { bookmark } = seed(db);
      const res = await generateKidVersion(db, bookmark.id, {
        llm: lax({ kid_md: bad, today: "Look up." }),
        now: NOW,
        log: () => {},
      });
      expect(res.ok).toBe(false);
      expect(row(db, bookmark.id).kidStatus).toBe("failed");
      expect(row(db, bookmark.id).kidError).toContain("Latin");
    }
  });

  it("rejects links and HTML even from a model that skips the schema (kid_md feeds mdToHtml)", async () => {
    const payloads = [
      { kid_md: "Bees make honey. <img src=x onerror=alert(1)>", today: "Look for a bee." },
      { kid_md: "Bees make honey.", today: "[tap](javascript:alert%281%29)" },
      { kid_md: "Read more at https://example.com today.", today: "Look for a bee." },
      { kid_md: "See www.example.com for bees.", today: "Look for a bee." },
    ];
    for (const bad of payloads) {
      const db = makeDb();
      const { bookmark } = seed(db);
      const res = await generateKidVersion(db, bookmark.id, { llm: lax(bad), now: NOW, log: () => {} });
      expect(res.ok).toBe(false);
      expect(row(db, bookmark.id).kidStatus).toBe("failed");
      expect(row(db, bookmark.id).kidError).toMatch(/links or URLs|HTML/);
    }
  });

  it("gets one repair pass: over-budget first, fixed second", async () => {
    const db = makeDb();
    const { bookmark } = seed(db, { months: 12 });
    const prompts: string[] = [];
    const replies = [
      JSON.stringify({ kid_md: words(80), today: "Hum a tune." }),
      JSON.stringify({ kid_md: words(40), today: "Hum a tune." }),
    ];
    const llm = makeCliLlm((prompt) => {
      prompts.push(prompt);
      return replies.shift()!;
    });
    const res = await generateKidVersion(db, bookmark.id, { llm, now: NOW, log: () => {} });
    expect(res.ok).toBe(true);
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("the limit is 60");
  });

  it("fails the bookmark when the repair is still over budget", async () => {
    const db = makeDb();
    const { bookmark } = seed(db, { months: 12 });
    const llm = makeCliLlm(() => JSON.stringify({ kid_md: words(80), today: "Hum a tune." }));
    const res = await generateKidVersion(db, bookmark.id, { llm, now: NOW, log: () => {} });
    expect(res.ok).toBe(false);
    const r = row(db, bookmark.id);
    expect(r.kidStatus).toBe("failed");
    expect(r.kidError).toContain("failed validation twice");
  });

  it("stores the draft, the age at generation, and flips the status", async () => {
    const db = makeDb();
    const { bookmark } = seed(db, { months: 40, note: "the cable idea blew my mind" });
    const seen: string[] = [];
    let model = "";
    const res = await generateKidVersion(db, bookmark.id, {
      llm: (prompt, zschema, opts) => {
        model = opts.model;
        return parsing({ kid_md: "  Big cables hold the road up.  ", today: " Can you hang a sock?  " }, seen)(
          prompt,
          zschema,
          opts,
        );
      },
      now: NOW,
      log: () => {},
    });
    expect(res.ok).toBe(true);
    const r = row(db, bookmark.id);
    expect(r).toMatchObject({
      kidStatus: "ready",
      kidMd: "Big cables hold the road up.",
      kidToday: "Can you hang a sock?",
      kidAgeMonths: 40,
      kidError: null,
    });
    expect(model).toBe(atlasModels().writer);
    const prompt = seen[0];
    expect(prompt).toContain("Wren");
    expect(prompt).toContain("3y 4m");
    expect(prompt).toContain(NONFICTION_FLOOR);
    expect(prompt).toContain("the cable idea blew my mind");
    expect(prompt).toContain("Cables carry the pull.");
    expect(prompt).toContain("at most 130 words");
    // markers and the assembled reading list never reach the model
    expect(prompt).not.toContain("[[visual:");
    expect(prompt).not.toContain("A link");
  });

  it("fails cleanly when the one-pager is missing or not ready", async () => {
    for (const onepager of ["none", "drafting"] as const) {
      const db = makeDb();
      const { bookmark } = seed(db, { onepager });
      let called = false;
      const res = await generateKidVersion(db, bookmark.id, {
        llm: () => {
          called = true;
          return {} as never;
        },
        now: NOW,
        log: () => {},
      });
      expect(res.ok).toBe(false);
      expect(called).toBe(false);
      const r = row(db, bookmark.id);
      expect(r.kidStatus).toBe("failed");
      expect(r.kidError).toContain("one-pager");
    }
  });

  it("reports a missing bookmark without throwing", async () => {
    const db = makeDb();
    const res = await generateKidVersion(db, 99, { llm: lax({ kid_md: "x", today: "y" }), log: () => {} });
    expect(res).toEqual({ ok: false, error: "bookmark #99 not found" });
  });

  it("clears an earlier error on success (regenerate)", async () => {
    const db = makeDb();
    const { bookmark } = seed(db);
    db.update(schema.atlasBookmarks)
      .set({ kidStatus: "failed", kidError: "old" })
      .where(eq(schema.atlasBookmarks.id, bookmark.id))
      .run();
    await generateKidVersion(db, bookmark.id, {
      llm: parsing({ kid_md: "Cables hold it.", today: "Hang a sock." }),
      now: NOW,
      log: () => {},
    });
    expect(row(db, bookmark.id)).toMatchObject({ kidStatus: "ready", kidError: null });
  });
});

describe("storyTopicForBookmark", () => {
  const node = { title: "Suspension bridges", blurb: "How can a road hang from a rope?" };

  it("names the node and carries the parent's note", () => {
    const topic = storyTopicForBookmark(node, { note: "the cable idea" });
    expect(topic).toContain("Suspension bridges");
    expect(topic).toContain("How can a road hang from a rope");
    expect(topic).toContain("the cable idea");
  });

  it("works without a note and stays within the express route's 200 chars", () => {
    expect(storyTopicForBookmark(node, { note: null })).toBe(
      "A true story book about Suspension bridges: How can a road hang from a rope?",
    );
    const long = storyTopicForBookmark(node, { note: "x".repeat(600) });
    expect(long.length).toBeLessThanOrEqual(200);
  });
});

describe("listBookmarkViews", () => {
  it("returns the route's shape, newest first, filterable by node", () => {
    const db = makeDb();
    const { node, map, bookmark } = seed(db, { note: "why" });
    const other = db
      .insert(schema.atlasNodes)
      .values({ mapId: map.id, parentId: null, position: 1, title: "Arches", blurb: "Why do arches stand?" })
      .returning()
      .get();
    const second = db
      .insert(schema.atlasBookmarks)
      .values({ nodeId: other.id, childId: bookmark.childId, createdAt: new Date(Date.now() + 5000) })
      .returning()
      .get();
    const all = listBookmarkViews(db);
    expect(all.map((b) => b.id)).toEqual([second.id, bookmark.id]);
    const one = listBookmarkViews(db, { nodeId: node.id });
    expect(one).toHaveLength(1);
    expect(one[0]).toMatchObject({
      id: bookmark.id,
      nodeId: node.id,
      nodeTitle: "Suspension bridges",
      mapId: map.id,
      mapTitle: "Engineering",
      note: "why",
      targetAgeYears: null,
      kidStatus: "drafting",
      kidMd: null,
      kidToday: null,
      kidAgeMonths: null,
      kidError: null,
    });
    expect(one[0].storyTopic).toContain("Suspension bridges");
  });
});
