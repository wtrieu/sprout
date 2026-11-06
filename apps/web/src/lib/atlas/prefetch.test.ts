import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "../../db/schema";
import type { DB } from "../../db/client";
import type { AtlasLlm } from "./llm";
import { PREFETCH_COUNT, prefetchFromNode, prefetchTargets } from "./prefetch";
import type { FrontierNode } from "./picker";

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

const words = (n: number, prefix = "w") =>
  Array.from({ length: n }, (_, i) => `${prefix}${i}`).join(" ");
const ONEPAGER = `### The question\n${words(120)}\n\n### The move\n${words(120, "m")}\n\n### Where it bites\n${words(110, "b")}`;
const ELI10 = words(150, "e");

const QUIZ = [1, 2, 3].map((i) => ({
  question: `Question number ${i} about the page?`,
  choices: ["Alpha", "Beta", "Gamma", "Delta"],
  answer: 0,
  why: "Because the page says so.",
}));

/**
 * Philosophy: three branches.
 *   A (Presocratics): A1 Thales, A2 Heraclitus, A3 Parmenides
 *   B (Hellenistic):  B1 Stoicism, B2 Epicureanism
 *   C (Medieval):     C1 Aquinas
 */
const seed = (db: DB) => {
  const map = db
    .insert(schema.atlasMaps)
    .values({ title: "Philosophy", blurb: "How to live, what is real.", status: "ready" })
    .returning()
    .get();
  const node = (parentId: number | null, position: number, title: string) =>
    db
      .insert(schema.atlasNodes)
      .values({
        mapId: map.id,
        parentId,
        position,
        title,
        blurb: `${title} — the live question.`,
        kind: parentId === null ? "branch" : "school",
      })
      .returning()
      .get();
  const A = node(null, 0, "Presocratics");
  const A1 = node(A.id, 0, "Thales");
  const A2 = node(A.id, 1, "Heraclitus");
  const A3 = node(A.id, 2, "Parmenides");
  const B = node(null, 1, "Hellenistic");
  const B1 = node(B.id, 0, "Stoicism");
  const B2 = node(B.id, 1, "Epicureanism");
  const C = node(null, 2, "Medieval");
  const C1 = node(C.id, 0, "Aquinas");
  return { map, A, A1, A2, A3, B, B1, B2, C, C1 };
};

const titleOf = (prompt: string): string =>
  /THIS NODE \([a-z]+\): ([^—]+) —/.exec(prompt)?.[1]?.trim() ?? "?";

/** Canned llm that records "<level>:<title>" in call order. */
const fakeLlm = (calls: string[], failOnepagerFor?: string): AtlasLlm => (prompt, zschema) => {
  if (prompt.includes("Write the ONE-PAGER")) {
    const title = titleOf(prompt);
    if (title === failOnepagerFor) throw new Error(`fell over on ${title}`);
    calls.push(`onepager:${title}`);
    return zschema.parse({ hook: `Hook: ${title}`, body_md: ONEPAGER, readings: [], quiz: QUIZ });
  }
  if (prompt.includes("Write the LIKE-I'M-10")) {
    calls.push(`eli10:${titleOf(prompt)}`);
    return zschema.parse({ body_md: ELI10 });
  }
  throw new Error(`unexpected prompt: ${prompt.slice(0, 80)}`);
};

const quiet = () => {};

const visit = (db: DB, id: number) =>
  db
    .update(schema.atlasNodes)
    .set({ visitedAt: new Date(), lastOpenedAt: new Date() })
    .where(eq(schema.atlasNodes.id, id))
    .run();

const rungs = (db: DB, nodeId: number) =>
  db.select().from(schema.atlasRungs).where(eq(schema.atlasRungs.nodeId, nodeId)).all();

const insertRung = (
  db: DB,
  nodeId: number,
  level: "onepager" | "eli10" | "deepdive",
  status: "ready" | "drafting",
  startedAt: Date = new Date(),
) =>
  db
    .insert(schema.atlasRungs)
    .values({
      nodeId,
      level,
      status,
      startedAt,
      bodyMd: status === "ready" ? (level === "eli10" ? ELI10 : ONEPAGER) : null,
      readyAt: status === "ready" ? new Date() : null,
    })
    .run();

const fn = (
  id: number,
  parentId: number | null,
  position: number,
  extra: Partial<FrontierNode> = {},
): FrontierNode => ({
  id,
  parentId,
  position,
  skipped: false,
  visitedAt: null,
  lastOpenedAt: null,
  ...extra,
});

describe("prefetchTargets", () => {
  // 1 A: 2 a1, 3 a2, 4 a3 · 5 B: 6 b1, 7 b2 · 8 C: 9 c1
  const nodes = (): FrontierNode[] => [
    fn(1, null, 0),
    fn(2, 1, 0),
    fn(3, 1, 1),
    fn(4, 1, 2),
    fn(5, null, 1),
    fn(6, 5, 0),
    fn(7, 5, 1),
    fn(8, null, 2),
    fn(9, 8, 0),
  ];

  it("is 3 by default", () => {
    expect(PREFETCH_COUNT).toBe(3);
  });

  it("goes children first, then siblings, then the next branch, capped at 3", () => {
    // Anchor is branch A: its children come first.
    expect(prefetchTargets(nodes(), 1)).toEqual([2, 3, 4]);
    // Anchor a1 (no children): siblings a2, a3, then the next branch.
    expect(prefetchTargets(nodes(), 2)).toEqual([3, 4, 5]);
    // Anchor a3 (last child): earlier sibling, then onward to the next branch.
    expect(prefetchTargets(nodes(), 4)).toEqual([3, 2, 5]);
    expect(prefetchTargets(nodes(), 2, 5)).toEqual([3, 4, 5, 6, 7]);
  });

  it("excludes visited nodes, skipped nodes, and children of skipped parents", () => {
    const ns = nodes();
    ns[2].visitedAt = new Date(); // a2 visited
    ns[3].skipped = true; // a3 skipped
    ns[4].skipped = true; // branch B skipped, so b1 and b2 drop out too
    // Branch C and its child come next; then the fallback reaches back to
    // branch A, which is still unvisited.
    expect(prefetchTargets(ns, 2)).toEqual([8, 9, 1]);
  });

  it("never includes the anchor itself", () => {
    expect(prefetchTargets(nodes(), 2)).not.toContain(2);
  });
});

describe("prefetchFromNode", () => {
  it("drafts both missing levels of the next 3 nodes, one-pager before eli10", async () => {
    const db = makeDb();
    const t = seed(db);
    visit(db, t.A1.id);
    const calls: string[] = [];
    const res = await prefetchFromNode(db, t.A1.id, { llm: fakeLlm(calls), log: quiet });
    expect(calls).toEqual([
      "onepager:Heraclitus",
      "eli10:Heraclitus",
      "onepager:Parmenides",
      "eli10:Parmenides",
      "onepager:Hellenistic",
      "eli10:Hellenistic",
    ]);
    expect(res).toEqual({ drafted: 6, skipped: 0, failed: 0 });
    for (const n of [t.A2, t.A3, t.B]) {
      const rows = rungs(db, n.id);
      expect(rows.map((r) => r.level).sort()).toEqual(["eli10", "onepager"]);
      expect(rows.every((r) => r.status === "ready")).toBe(true);
    }
    // Nothing outside the targets was touched.
    for (const n of [t.A1, t.B1, t.B2, t.C, t.C1]) expect(rungs(db, n.id)).toEqual([]);
  });

  it("never creates a deepdive rung", async () => {
    const db = makeDb();
    const t = seed(db);
    visit(db, t.A1.id);
    await prefetchFromNode(db, t.A1.id, { llm: fakeLlm([]), log: quiet });
    const all = db.select().from(schema.atlasRungs).all();
    expect(all.length).toBeGreaterThan(0);
    expect(all.some((r) => r.level === "deepdive")).toBe(false);
  });

  it("moves past visited and skipped nodes to the next eligible ones", async () => {
    const db = makeDb();
    const t = seed(db);
    visit(db, t.A1.id);
    visit(db, t.A2.id);
    db.update(schema.atlasNodes).set({ skipped: true }).where(eq(schema.atlasNodes.id, t.A3.id)).run();
    const calls: string[] = [];
    await prefetchFromNode(db, t.A1.id, { llm: fakeLlm(calls), log: quiet });
    // a2 visited, a3 skipped: the targets move on to branch B and its children.
    expect(calls.filter((c) => c.startsWith("onepager:"))).toEqual([
      "onepager:Hellenistic",
      "onepager:Stoicism",
      "onepager:Epicureanism",
    ]);
  });

  it("skips ready rungs and fresh-drafting rungs, redrafts stale drafting ones", async () => {
    const db = makeDb();
    const t = seed(db);
    visit(db, t.A1.id);
    const now = new Date("2026-11-06T12:00:00Z");
    const fresh = new Date(now.getTime() - 60 * 1000);
    const stale = new Date(now.getTime() - 60 * 60 * 1000);
    // Heraclitus: both ready. Parmenides: one-pager fresh-drafting.
    // Hellenistic: one-pager ready, eli10 stale-drafting.
    insertRung(db, t.A2.id, "onepager", "ready");
    insertRung(db, t.A2.id, "eli10", "ready");
    insertRung(db, t.A3.id, "onepager", "drafting", fresh);
    insertRung(db, t.B.id, "onepager", "ready");
    insertRung(db, t.B.id, "eli10", "drafting", stale);

    const calls: string[] = [];
    const res = await prefetchFromNode(db, t.A1.id, { llm: fakeLlm(calls), now, log: quiet });
    expect(calls).toEqual(["eli10:Hellenistic"]);
    // Heraclitus x2 + Parmenides x2 (one-pager claimed, eli10 waits on it) skipped.
    expect(res).toEqual({ drafted: 1, skipped: 5, failed: 0 });
    expect(rungs(db, t.A3.id).find((r) => r.level === "onepager")?.status).toBe("drafting");
    expect(rungs(db, t.A3.id).some((r) => r.level === "eli10")).toBe(false);
    expect(rungs(db, t.B.id).find((r) => r.level === "eli10")?.status).toBe("ready");
  });

  it("redrafts a stale drafting one-pager and then its eli10", async () => {
    const db = makeDb();
    const t = seed(db);
    visit(db, t.C1.id); // only a few nodes remain after c1: none -> use fallback ordering
    const now = new Date("2026-11-06T12:00:00Z");
    insertRung(db, t.A1.id, "onepager", "drafting", new Date(now.getTime() - 3 * 60 * 60 * 1000));
    const calls: string[] = [];
    await prefetchFromNode(db, t.C1.id, { llm: fakeLlm(calls), now, log: quiet });
    expect(calls.slice(0, 3)).toEqual(["onepager:Presocratics", "eli10:Presocratics", "onepager:Thales"]);
    expect(calls).toContain("eli10:Thales");
  });

  it("a second run drafts nothing", async () => {
    const db = makeDb();
    const t = seed(db);
    visit(db, t.A1.id);
    await prefetchFromNode(db, t.A1.id, { llm: fakeLlm([]), log: quiet });
    const calls: string[] = [];
    const res = await prefetchFromNode(db, t.A1.id, { llm: fakeLlm(calls), log: quiet });
    expect(calls).toEqual([]);
    expect(res).toEqual({ drafted: 0, skipped: 6, failed: 0 });
  });

  it("a failed one-pager counts as failed and its eli10 is skipped, not retried", async () => {
    const db = makeDb();
    const t = seed(db);
    visit(db, t.A1.id);
    const calls: string[] = [];
    const res = await prefetchFromNode(db, t.A1.id, { llm: fakeLlm(calls, "Heraclitus"), log: quiet });
    expect(res).toEqual({ drafted: 4, skipped: 1, failed: 1 });
    expect(calls).not.toContain("eli10:Heraclitus");
    expect(rungs(db, t.A2.id).map((r) => `${r.level}:${r.status}`)).toEqual(["onepager:failed"]);
  });

  it("an unknown node id returns zeros without throwing", async () => {
    const db = makeDb();
    seed(db);
    const calls: string[] = [];
    await expect(prefetchFromNode(db, 9999, { llm: fakeLlm(calls), log: quiet })).resolves.toEqual({
      drafted: 0,
      skipped: 0,
      failed: 0,
    });
    expect(calls).toEqual([]);
  });
});
