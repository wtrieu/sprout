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
import {
  MAX_NODES,
  MIN_KEEP_CHILDREN,
  MapOutlineSchema,
  buildChildrenPrompt,
  draftMap,
  normalizeMapDraft,
  type BranchChildren,
} from "./draftMap";

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

const outlineOf = (branchCount: number) =>
  MapOutlineSchema.parse({
    title: "Philosophy",
    blurb: "Twenty-five centuries of arguing about how to live and what is real.",
    branches: Array.from({ length: branchCount }, (_, i) => ({
      title: `Branch ${i}`,
      blurb: `What is the question branch ${i} keeps asking?`,
      discipline: "reasoning" as const,
    })),
  });

const childrenOf = (branchCount: number, perBranch: number): BranchChildren["children"][] =>
  Array.from({ length: branchCount }, (_, i) =>
    Array.from({ length: perBranch }, (_, j) => ({
      title: `Child ${i}-${j}`,
      blurb: `Why does ${i}-${j} still matter today?`,
      kind: "concept" as const,
      discipline: "evidence" as const,
    })),
  );

describe("normalizeMapDraft", () => {
  it("dedupes titles across the map, trims to MAX_NODES from the largest branches, and positions everything", () => {
    const outline = outlineOf(10);
    const children = childrenOf(10, 6); // 10 + 60 = 70 nodes
    children[1][0] = { ...children[1][0], title: "Child 0-0" }; // duplicate of a branch-0 child
    children[2][5] = { ...children[2][5], title: "branch 3" }; // duplicate of a branch title, case-insensitive

    const draft = normalizeMapDraft(outline, children);
    const total = draft.branches.reduce((n, b) => n + 1 + b.children.length, 0);
    expect(total).toBe(MAX_NODES);
    expect(draft.branches.map((b) => b.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(draft.branches[1].children.some((c) => c.title === "Child 0-0")).toBe(false);
    const titles = draft.branches.flatMap((b) => [b.title, ...b.children.map((c) => c.title)]);
    expect(new Set(titles.map((t) => t.toLowerCase())).size).toBe(titles.length);
    for (const b of draft.branches) {
      expect(b.children.map((c) => c.position)).toEqual(b.children.map((_, j) => j));
    }
  });

  it("keeps a branch with no children rather than dropping it", () => {
    const draft = normalizeMapDraft(outlineOf(6), [[], [], [], [], [], []]);
    expect(draft.branches).toHaveLength(6);
  });

  it("never trims a branch below the per-branch floor, even past the cap", () => {
    const outline = outlineOf(16);
    const draft = normalizeMapDraft(outline, childrenOf(16, 6)); // 16 + 96 = 112 nodes
    expect(draft.branches.every((b) => b.children.length === MIN_KEEP_CHILDREN)).toBe(true);
    const total = draft.branches.reduce((n, b) => n + 1 + b.children.length, 0);
    expect(total).toBe(16 + 16 * MIN_KEEP_CHILDREN); // 64 > MAX_NODES, by design
    // Trimming drops the lowest-ranked children, so the first three survive.
    expect(draft.branches[0].children.map((c) => c.title)).toEqual(["Child 0-0", "Child 0-1", "Child 0-2"]);
  });
});

describe("draftMap", () => {
  it("tells each branch what the others cover", () => {
    const prompt = buildChildrenPrompt({
      mapTitle: "Philosophy",
      mapBlurb: "x",
      branch: { title: "Kant", blurb: "?" },
      otherBranches: ["Rationalism and Empiricism", "Existentialism"],
    });
    expect(prompt).toContain("- Rationalism and Empiricism");
    expect(prompt).toContain("do NOT place");
  });

  it("stores the outline and children as a two-level tree and flips the map to ready", () => {
    const db = makeDb();
    const map = db
      .insert(schema.atlasMaps)
      .values({ title: "Philosophy", brief: "brief" })
      .returning()
      .get();
    const calls: string[] = [];
    const llm: AtlasLlm = (prompt, zschema, opts) => {
      calls.push(opts.label ?? "?");
      if (prompt.includes("drafting the outline")) return zschema.parse(outlineOf(8));
      return zschema.parse({ children: childrenOf(1, 3)[0] });
    };

    const res = draftMap(db, map.id, { llm, log: () => {} });
    expect(res).toMatchObject({ ok: true, nodeCount: 8 + 3 }); // children dedupe to the first branch's three
    expect(calls[0]).toBe("map outline");
    expect(calls).toHaveLength(1 + 8);

    const row = db.select().from(schema.atlasMaps).where(eq(schema.atlasMaps.id, map.id)).get()!;
    expect(row.status).toBe("ready");
    expect(row.blurb).toMatch(/centuries/);
    const nodes = db.select().from(schema.atlasNodes).where(eq(schema.atlasNodes.mapId, map.id)).all();
    expect(nodes.filter((n) => n.parentId === null)).toHaveLength(8);
    expect(nodes.filter((n) => n.parentId !== null)).toHaveLength(3);
    // Discipline tags land at draft time: branches and children both.
    expect(nodes.every((n) => n.discipline !== null)).toBe(true);
    expect(nodes.find((n) => n.parentId === null)?.discipline).toBe("reasoning");
    expect(nodes.find((n) => n.parentId !== null)?.discipline).toBe("evidence");
  });

  it("marks at most one rare child per branch at draft time, never a branch", () => {
    const db = makeDb();
    const map = db.insert(schema.atlasMaps).values({ title: "Philosophy", brief: "brief" }).returning().get();
    const llm: AtlasLlm = (prompt, zschema) => {
      if (prompt.includes("drafting the outline")) return zschema.parse(outlineOf(8));
      return zschema.parse({ children: childrenOf(1, 4)[0] });
    };
    // Every branch is offered the same child titles, so only the first keeps any.
    expect(draftMap(db, map.id, { llm, log: () => {} }).ok).toBe(true);
    const nodes = db.select().from(schema.atlasNodes).where(eq(schema.atlasNodes.mapId, map.id)).all();
    expect(nodes.filter((n) => n.parentId === null && n.rare)).toHaveLength(0);
    for (const b of nodes.filter((n) => n.parentId === null)) {
      const kids = nodes.filter((n) => n.parentId === b.id);
      expect(kids.filter((k) => k.rare).length).toBe(kids.length > 0 ? 1 : 0);
    }
  });

  it("marks the map failed when the outline call throws", () => {
    const db = makeDb();
    const map = db.insert(schema.atlasMaps).values({ title: "Physics" }).returning().get();
    const llm: AtlasLlm = () => {
      throw new Error("model unavailable");
    };
    const res = draftMap(db, map.id, { llm, log: () => {} });
    expect(res).toMatchObject({ ok: false, error: "model unavailable" });
    const row = db.select().from(schema.atlasMaps).where(eq(schema.atlasMaps.id, map.id)).get()!;
    expect(row.status).toBe("failed");
    expect(row.error).toBe("model unavailable");
  });
});
