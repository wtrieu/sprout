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
import { preloadMap, suggestedStarts } from "./preload";
import type { QuizQuestion } from "./rungs";
import type { FetchLike } from "./verify";
import type { Visual } from "./visuals";

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

const QUIZ: QuizQuestion[] = [
  {
    question: "What is the branch's live question?",
    choices: ["Alpha", "Beta", "Gamma", "Delta"],
    answer: 0,
    why: "The page opens on it.",
  },
  {
    question: "Which move defines the school?",
    choices: ["One", "Two", "Three", "Four"],
    answer: 1,
    why: "It is the core move in plain words.",
  },
  {
    question: "Where does it still bite today?",
    choices: ["Here", "There", "Everywhere", "Nowhere"],
    answer: 2,
    why: "The last section says exactly where.",
  },
];

/**
 * One map: two branches with two children each (6 nodes). Branch nodes are
 * nodes like any other, so all 6 want one-pagers.
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
  const a = node(null, 0, "The Presocratics");
  const a1 = node(a.id, 0, "Thales");
  const a2 = node(a.id, 1, "Heraclitus");
  const b = node(null, 1, "The Hellenistic schools");
  const b1 = node(b.id, 0, "Stoicism");
  const b2 = node(b.id, 1, "Epicureanism");
  return { map, nodes: [a, a1, a2, b, b1, b2] };
};

const nodeTitle = (prompt: string): string =>
  /THIS NODE \([a-z]+\): ([^—]+) —/.exec(prompt)?.[1]?.trim() ?? "?";

type Recorder = { drafts: string[]; quizzes: string[]; visuals: string[] };

const newRec = (): Recorder => ({ drafts: [], quizzes: [], visuals: [] });

/** Routes on prompt content: drafts, quiz backfill, visuals backfill. */
const fakeLlm =
  (
    rec: Recorder,
    opts: {
      failFor?: string;
      visualsFor?: Record<string, { visuals?: unknown[]; images?: unknown[] }>;
    } = {},
  ): AtlasLlm =>
  (prompt, zschema) => {
    if (prompt.includes("Write the ONE-PAGER")) {
      const title = nodeTitle(prompt);
      if (opts.failFor && title === opts.failFor) throw new Error(`model fell over on ${title}`);
      rec.drafts.push(title);
      return zschema.parse({ hook: `Hook: ${title}`, body_md: ONEPAGER, readings: [], quiz: QUIZ });
    }
    if (prompt.includes("Now write its quiz")) {
      rec.quizzes.push(nodeTitle(prompt));
      return zschema.parse({ quiz: QUIZ });
    }
    if (prompt.includes("Now decide whether it deserves visuals")) {
      const title = nodeTitle(prompt);
      rec.visuals.push(title);
      const out = opts.visualsFor?.[title] ?? { visuals: [], images: [] };
      return zschema.parse({ visuals: out.visuals ?? [], images: out.images ?? [] });
    }
    throw new Error(`unexpected prompt: ${prompt.slice(0, 80)}`);
  };

const capturingSend = () => {
  const sent: Array<{ subject: string; html: string }> = [];
  const send = async (input: { subject: string; html: string }) => {
    sent.push(input);
    return { sent: true, id: "test" };
  };
  return { sent, send };
};

const quiet = () => {};

const onepagerRows = (db: DB) =>
  db.select().from(schema.atlasRungs).where(eq(schema.atlasRungs.level, "onepager")).all();

describe("preloadMap", () => {
  it("shards partition the nodes exactly once, and only the finishing shard emails", async () => {
    const db = makeDb();
    const { map, nodes } = seed(db);
    const { sent, send } = capturingSend();

    const rec0: Recorder = newRec();
    const first = await preloadMap(db, map.id, {
      shard: 0,
      shards: 2,
      llm: fakeLlm(rec0),
      send,
      log: quiet,
    });
    expect(first.notified).toBe(false); // the other shard's nodes have no one-pager yet
    expect(sent).toHaveLength(0);

    const rec1: Recorder = newRec();
    const second = await preloadMap(db, map.id, {
      shard: 1,
      shards: 2,
      llm: fakeLlm(rec1),
      send,
      log: quiet,
    });
    expect(second.notified).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe("Atlas · Philosophy is ready");

    // Every node drafted exactly once, split across the two shards.
    const all = [...rec0.drafts, ...rec1.drafts].sort();
    expect(all).toEqual(nodes.map((n) => n.title).sort());
    expect(rec0.drafts.filter((t) => rec1.drafts.includes(t))).toEqual([]);
    const rows = onepagerRows(db);
    expect(rows).toHaveLength(6);
    expect(rows.every((r) => r.status === "ready")).toBe(true);
    // Fresh drafts carry their quiz from the same call — no backfill calls.
    expect(rows.every((r) => r.quizJson !== null)).toBe(true);
    expect([...rec0.quizzes, ...rec1.quizzes]).toEqual([]);
  });

  it("a second run drafts nothing and cannot email twice", async () => {
    const db = makeDb();
    const { map } = seed(db);
    const { sent, send } = capturingSend();
    for (const shard of [0, 1]) {
      await preloadMap(db, map.id, { shard, shards: 2, llm: fakeLlm(newRec()), send, log: quiet });
    }
    expect(sent).toHaveLength(1);

    // Both shards run again over a fully preloaded map: both see it complete,
    // neither can claim the notification a second time.
    for (const shard of [0, 1]) {
      const rec: Recorder = newRec();
      const res = await preloadMap(db, map.id, { shard, shards: 2, llm: fakeLlm(rec), send, log: quiet });
      expect(rec.drafts).toEqual([]);
      expect(rec.quizzes).toEqual([]);
      expect(res).toMatchObject({ drafted: 0, failed: 0, notified: false });
    }
    expect(sent).toHaveLength(1);
  });

  it("skips a one-pager that is drafting and not stale, and holds the email", async () => {
    const db = makeDb();
    const { map, nodes } = seed(db);
    db.insert(schema.atlasRungs)
      .values({ nodeId: nodes[0].id, level: "onepager", status: "drafting", startedAt: new Date() })
      .run();
    const rec: Recorder = newRec();
    const { sent, send } = capturingSend();
    const res = await preloadMap(db, map.id, { llm: fakeLlm(rec), send, log: quiet });
    expect(rec.drafts).not.toContain(nodes[0].title);
    expect(rec.drafts).toHaveLength(5);
    expect(res.notified).toBe(false); // one rung still drafting
    expect(sent).toHaveLength(0);
  });

  it("backfills quizzes only into null rows (the live Philosophy map)", async () => {
    const db = makeDb();
    const { map, nodes } = seed(db);
    // A pre-PR-A map: every one-pager ready, quiz_json null — except one
    // that somehow has a quiz already.
    const existingQuiz = JSON.stringify([{ question: "already here" }]);
    nodes.forEach((n, i) => {
      db.insert(schema.atlasRungs)
        .values({
          nodeId: n.id,
          level: "onepager",
          status: "ready",
          hook: `Hook: ${n.title}`,
          bodyMd: ONEPAGER,
          quizJson: i === 0 ? existingQuiz : null,
          readyAt: new Date(),
        })
        .run();
    });
    const rec: Recorder = newRec();
    const { sent, send } = capturingSend();
    const res = await preloadMap(db, map.id, { llm: fakeLlm(rec), send, log: quiet });
    expect(rec.drafts).toEqual([]); // ready rows are a no-op
    expect(rec.quizzes.sort()).toEqual(nodes.slice(1).map((n) => n.title).sort());
    const rows = onepagerRows(db);
    expect(rows.find((r) => r.nodeId === nodes[0].id)?.quizJson).toBe(existingQuiz);
    for (const row of rows.filter((r) => r.nodeId !== nodes[0].id)) {
      expect(JSON.parse(row.quizJson ?? "null")).toEqual(QUIZ);
    }
    // Everything was already ready, so this run also claims the email.
    expect(res.notified).toBe(true);
    expect(sent).toHaveLength(1);
  });

  it("still notifies when a one-pager failed, and the email says so", async () => {
    const db = makeDb();
    const { map } = seed(db);
    const rec: Recorder = newRec();
    const { sent, send } = capturingSend();
    const res = await preloadMap(db, map.id, {
      llm: fakeLlm(rec, { failFor: "Heraclitus" }),
      send,
      log: quiet,
    });
    expect(res.failed).toBe(1);
    expect(res.notified).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].html).toContain("5 of 6 one-pagers ready");
    expect(sent[0].html).toContain("1 failed — regenerate them from the map page");
    const failedRow = onepagerRows(db).find((r) => r.status === "failed");
    expect(failedRow?.error).toMatch(/fell over/);
  });

  it("backfills visuals into null rows, anchoring markers to headings (the live map)", async () => {
    const db = makeDb();
    const { map, nodes } = seed(db);
    // A pre-PR-B map: every one-pager ready with its quiz, visuals never asked.
    for (const n of nodes) {
      db.insert(schema.atlasRungs)
        .values({
          nodeId: n.id,
          level: "onepager",
          status: "ready",
          hook: `Hook: ${n.title}`,
          bodyMd: ONEPAGER,
          quizJson: JSON.stringify(QUIZ),
          readyAt: new Date(),
        })
        .run();
    }
    const geomap: Visual = {
      kind: "geomap",
      slug: "miletus",
      title: "Where Thales worked",
      places: [{ label: "Miletus", lat: 37.53, lon: 27.28 }],
      after_heading: "The move",
    };
    const image = {
      slug: "zeno-bust",
      query: "Zeno of Citium bust",
      caption: "A Roman copy of the school's founder.",
      after_heading: null,
    };
    const fetchImpl: FetchLike = async (url) => {
      if (url.includes("list=search")) {
        return new Response(
          JSON.stringify({ query: { search: [{ title: "File:Zeno of Citium bust.jpg" }] } }),
          { status: 200 },
        );
      }
      if (url.includes("prop=imageinfo")) {
        return new Response(
          JSON.stringify({
            query: {
              pages: [
                {
                  imageinfo: [
                    {
                      url: "https://upload.wikimedia.org/zeno.jpg",
                      descriptionurl: "https://commons.wikimedia.org/wiki/File:Zeno.jpg",
                      thumburl: "https://upload.wikimedia.org/thumb/zeno-640.jpg",
                      width: 2000,
                      height: 1500,
                      extmetadata: {
                        Artist: { value: "Paolo Monti" },
                        LicenseShortName: { value: "CC BY-SA 4.0" },
                      },
                    },
                  ],
                },
              ],
            },
          }),
          { status: 200 },
        );
      }
      return new Response("nope", { status: 404 });
    };

    const rec: Recorder = newRec();
    const { send } = capturingSend();
    const res = await preloadMap(db, map.id, {
      llm: fakeLlm(rec, {
        visualsFor: { Thales: { visuals: [geomap] }, Stoicism: { images: [image] } },
      }),
      fetchImpl,
      send,
      log: quiet,
    });
    expect(rec.drafts).toEqual([]);
    expect(rec.visuals.sort()).toEqual(nodes.map((n) => n.title).sort());
    expect(res.visuals).toBe(6);

    const rows = onepagerRows(db);
    const thales = rows.find((r) => r.nodeId === nodes[1].id)!;
    expect(thales.bodyMd).toContain("### The move\n\n[[visual:miletus]]");
    expect(JSON.parse(thales.visualsJson ?? "null")).toMatchObject([{ slug: "miletus" }]);

    const stoicism = rows.find((r) => r.nodeId === nodes[4].id)!;
    expect(stoicism.bodyMd?.endsWith("[[image:zeno-bust]]")).toBe(true);
    const images = db
      .select()
      .from(schema.atlasImages)
      .where(eq(schema.atlasImages.nodeId, nodes[4].id))
      .all();
    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({ status: "verified", proposedBy: "backfill" });

    // A page that wants no visuals is marked asked ("[]") and never re-asked.
    const heraclitus = rows.find((r) => r.nodeId === nodes[2].id)!;
    expect(heraclitus.bodyMd).toBe(ONEPAGER);
    expect(heraclitus.visualsJson).toBe("[]");

    const rec2: Recorder = newRec();
    const second = await preloadMap(db, map.id, { llm: fakeLlm(rec2), fetchImpl, send, log: quiet });
    expect(rec2.visuals).toEqual([]);
    expect(second.visuals).toBe(0);
  });

  it("suggests the first unvisited child of the first three branches", () => {
    const db = makeDb();
    const { nodes } = seed(db);
    db.update(schema.atlasNodes)
      .set({ visitedAt: new Date() })
      .where(eq(schema.atlasNodes.id, nodes[1].id)) // Thales visited
      .run();
    const fresh = db.select().from(schema.atlasNodes).all();
    const starts = suggestedStarts(fresh, (id) => `hook-${id}`);
    expect(starts.map((s) => s.title)).toEqual(["Heraclitus", "Stoicism"]);
    expect(starts[0].hook).toBe(`hook-${nodes[2].id}`);
  });
});
