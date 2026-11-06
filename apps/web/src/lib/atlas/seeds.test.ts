import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "../../db/schema";
import type { DB } from "../../db/client";
import { runWeeklyFrontier } from "./frontier";
import type { AtlasLlm } from "./llm";
import { pickFrontierNode, type FrontierNode } from "./picker";
import type { QuizQuestion } from "./rungs";
import { detectSeedKind, extractSeedUrl, placePendingSeeds } from "./seeds";
import type { FetchLike } from "./verify";

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

/** Two branches, two children each. */
const seedMap = (db: DB) => {
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
  return { map, a, a1, a2, b, b1, b2 };
};

const addSeed = (db: DB, text: string) =>
  db
    .insert(schema.atlasSeeds)
    .values({
      text,
      kind: detectSeedKind(text),
      url: detectSeedKind(text) === "url" ? extractSeedUrl(text) : null,
    })
    .returning()
    .get();

const seedRow = (db: DB, id: number) =>
  db.select().from(schema.atlasSeeds).where(eq(schema.atlasSeeds.id, id)).get()!;

type Reply = Record<string, unknown>;
/** Canned placer: replies in order, records prompts, parses like the real adapter's first pass. */
const placer = (...replies: Reply[]) => {
  const prompts: string[] = [];
  const llm: AtlasLlm = (prompt, zschema) => {
    prompts.push(prompt);
    const next = replies.shift();
    if (!next) throw new Error("unexpected extra model call");
    return zschema.parse(next);
  };
  return { prompts, llm };
};

/** A placer that returns its reply untouched, so the code's own validation is what is under test. */
const rawPlacer = (reply: Reply): AtlasLlm => () => reply as never;

const quiet = () => {};
const noFetch: FetchLike = async () => new Response("", { status: 404 });

describe("detectSeedKind", () => {
  it("url: http(s) links, links inside text, and bare domain paths", () => {
    expect(detectSeedKind("https://plato.stanford.edu/entries/stoicism/")).toBe("url");
    expect(detectSeedKind("http://example.com/a?b=1")).toBe("url");
    expect(detectSeedKind("  worth reading https://example.com/essay.  ")).toBe("url");
    expect(detectSeedKind("plato.stanford.edu/entries/stoicism")).toBe("url");
    expect(detectSeedKind("www.example.org")).toBe("url");
  });

  it("title: quoted strings and short title-cased names", () => {
    expect(detectSeedKind('"the selfish gene"')).toBe("title");
    expect(detectSeedKind("“Gödel, Escher, Bach”")).toBe("title");
    expect(detectSeedKind("The Selfish Gene")).toBe("title");
    expect(detectSeedKind("Meditations")).toBe("title");
    expect(detectSeedKind("Thinking, Fast and Slow by Daniel Kahneman")).toBe("title");
  });

  it("idea: sentences, questions and lowercase thoughts", () => {
    expect(detectSeedKind("why do kids keep asking why")).toBe("idea");
    expect(detectSeedKind("How do bridges stay up?")).toBe("idea");
    expect(detectSeedKind("I want to understand how money got invented.")).toBe("idea");
    expect(detectSeedKind("what if gravity was optional")).toBe("idea");
  });

  it("does not take a dotted word for a link", () => {
    expect(detectSeedKind("e.g. the trolley problem")).toBe("idea");
    expect(detectSeedKind("Mr. Rogers")).toBe("title");
  });
});

describe("extractSeedUrl", () => {
  it("returns an absolute url, trimming trailing punctuation, https for bare domains", () => {
    expect(extractSeedUrl("see https://example.com/a.")).toBe("https://example.com/a");
    expect(extractSeedUrl("example.com/x")).toBe("https://example.com/x");
    expect(extractSeedUrl("no link here")).toBeNull();
  });
});

describe("placePendingSeeds: attach", () => {
  it("inserts a child under the chosen branch and marks the seed attached", async () => {
    const db = makeDb();
    const m = seedMap(db);
    const seed = addSeed(db, "The Selfish Gene");
    const { prompts, llm } = placer({
      action: "attach",
      parentId: m.b.id,
      title: "Memes and replicators",
      blurb: "Do ideas evolve like genes?",
      kind: "text",
      reason: "A book about replicators belongs with the schools that ask what we are.",
    });
    const res = await placePendingSeeds(db, m.map.id, { llm, fetchImpl: noFetch, log: quiet });

    expect(res.attached).toHaveLength(1);
    const node = db
      .select()
      .from(schema.atlasNodes)
      .where(eq(schema.atlasNodes.id, res.attached[0].nodeId))
      .get()!;
    expect(node).toMatchObject({
      mapId: m.map.id,
      parentId: m.b.id,
      position: 2, // after Stoicism (0) and Epicureanism (1)
      title: "Memes and replicators",
      kind: "text",
      seedId: seed.id,
      discipline: null,
      rare: false,
    });
    const after = seedRow(db, seed.id);
    expect(after).toMatchObject({
      status: "attached",
      nodeId: node.id,
      mapId: m.map.id,
      resolution: "A book about replicators belongs with the schools that ask what we are.",
    });
    expect(after.resolvedAt).toBeInstanceOf(Date);
    // the model was shown branch ids and titles
    expect(prompts[0]).toContain(`[${m.a.id}] The Presocratics`);
    expect(prompts[0]).toContain("- Stoicism");
    expect(prompts[0]).toContain("The Selfish Gene");
  });

  it("an invalid parentId leaves the seed pending and writes nothing", async () => {
    const db = makeDb();
    const m = seedMap(db);
    const seed = addSeed(db, "The Selfish Gene");
    const before = db.select().from(schema.atlasNodes).all().length;
    const logs: string[] = [];
    // a child's id is not an offered branch; neither is a made-up one
    for (const parentId of [m.b1.id, 9999, null]) {
      const res = await placePendingSeeds(db, m.map.id, {
        llm: rawPlacer({ action: "attach", parentId, title: "X", blurb: "Y", reason: "r" }),
        fetchImpl: noFetch,
        log: (msg) => logs.push(msg),
      });
      expect(res.attached).toHaveLength(0);
      expect(res.pending).toBe(1);
    }
    expect(seedRow(db, seed.id).status).toBe("pending");
    expect(db.select().from(schema.atlasNodes).all()).toHaveLength(before);
    expect(logs.some((l) => l.includes("invalid placement"))).toBe(true);
  });

  it("a seed resolved during the model call is skipped, never attached twice", async () => {
    const db = makeDb();
    const m = seedMap(db);
    const seed = addSeed(db, "The Selfish Gene");
    // A concurrent run resolves the seed while our (slow) placement call is
    // out; the claim inside the transaction must then insert nothing.
    const llm: AtlasLlm = (_prompt, zschema) => {
      db.update(schema.atlasSeeds)
        .set({ status: "dismissed", resolution: "the other run", resolvedAt: new Date() })
        .where(eq(schema.atlasSeeds.id, seed.id))
        .run();
      return zschema.parse({
        action: "attach",
        parentId: m.b.id,
        title: "Memes and replicators",
        blurb: "Do ideas evolve like genes?",
        kind: "text",
        reason: "Belongs with the schools.",
      });
    };
    const before = db.select().from(schema.atlasNodes).all().length;
    const res = await placePendingSeeds(db, m.map.id, { llm, fetchImpl: noFetch, log: quiet });
    expect(res.attached).toHaveLength(0);
    expect(db.select().from(schema.atlasNodes).all().length).toBe(before);
    expect(seedRow(db, seed.id)).toMatchObject({ status: "dismissed", resolution: "the other run" });
  });

  it("a dismiss landing after another run resolved the seed changes nothing", async () => {
    const db = makeDb();
    const m = seedMap(db);
    const seed = addSeed(db, "Some idea about change");
    const llm: AtlasLlm = (_prompt, zschema) => {
      db.update(schema.atlasSeeds)
        .set({ status: "attached", nodeId: m.b1.id, mapId: m.map.id, resolution: "won the race", resolvedAt: new Date() })
        .where(eq(schema.atlasSeeds.id, seed.id))
        .run();
      return zschema.parse({ action: "dismiss", reason: "too vague" });
    };
    const res = await placePendingSeeds(db, m.map.id, { llm, fetchImpl: noFetch, log: quiet });
    expect(res.dismissed).toBe(0);
    expect(seedRow(db, seed.id)).toMatchObject({ status: "attached", resolution: "won the race" });
  });

  it("a model failure leaves the seed pending and later seeds still run", async () => {
    const db = makeDb();
    const m = seedMap(db);
    const first = addSeed(db, "Something odd");
    const second = addSeed(db, "Meditations");
    let calls = 0;
    const llm: AtlasLlm = (_p, zschema) => {
      calls += 1;
      if (calls === 1) throw new Error("response failed validation twice");
      return zschema.parse({
        action: "attach",
        parentId: m.b.id,
        title: "Meditations of Marcus",
        blurb: "What does a Stoic emperor tell himself?",
        reason: "Stoic text.",
      });
    };
    const res = await placePendingSeeds(db, m.map.id, { llm, fetchImpl: noFetch, log: quiet });
    expect(res.pending).toBe(1);
    expect(res.attached).toHaveLength(1);
    expect(seedRow(db, first.id).status).toBe("pending");
    expect(seedRow(db, second.id).status).toBe("attached");
  });

  it("a title already on the map is dismissed, not duplicated", async () => {
    const db = makeDb();
    const m = seedMap(db);
    const seed = addSeed(db, "Stoicism");
    const res = await placePendingSeeds(db, m.map.id, {
      llm: rawPlacer({ action: "attach", parentId: m.b.id, title: "stoicism", blurb: "b", reason: "r" }),
      fetchImpl: noFetch,
      log: quiet,
    });
    expect(res.dismissed).toBe(1);
    expect(seedRow(db, seed.id)).toMatchObject({ status: "dismissed" });
    expect(seedRow(db, seed.id).resolution).toContain("Stoicism");
    expect(db.select().from(schema.atlasNodes).all()).toHaveLength(6);
  });
});

describe("placePendingSeeds: new_map and dismiss", () => {
  it("new_map records the proposed map title and drafts nothing", async () => {
    const db = makeDb();
    const m = seedMap(db);
    const seed = addSeed(db, "how do bridges stay up");
    const res = await placePendingSeeds(db, m.map.id, {
      llm: placer({ action: "new_map", title: "Engineering", reason: "Not philosophy." }).llm,
      fetchImpl: noFetch,
      log: quiet,
    });
    expect(res.newMap).toBe(1);
    expect(seedRow(db, seed.id)).toMatchObject({
      status: "new_map",
      resolution: "Engineering",
      nodeId: null,
    });
    expect(db.select().from(schema.atlasMaps).all()).toHaveLength(1);
    expect(db.select().from(schema.atlasNodes).all()).toHaveLength(6);
  });

  it("dismiss stores the reason", async () => {
    const db = makeDb();
    const m = seedMap(db);
    const seed = addSeed(db, "buy milk tomorrow");
    const res = await placePendingSeeds(db, m.map.id, {
      llm: placer({ action: "dismiss", reason: "A chore, not a topic." }).llm,
      fetchImpl: noFetch,
      log: quiet,
    });
    expect(res.dismissed).toBe(1);
    expect(seedRow(db, seed.id)).toMatchObject({ status: "dismissed", resolution: "A chore, not a topic." });
  });

  it("is idempotent: with nothing pending there are no model calls", async () => {
    const db = makeDb();
    const m = seedMap(db);
    addSeed(db, "buy milk tomorrow");
    const first = placer({ action: "dismiss", reason: "A chore." });
    await placePendingSeeds(db, m.map.id, { llm: first.llm, fetchImpl: noFetch, log: quiet });
    expect(first.prompts).toHaveLength(1);

    const second = placer(); // any call throws
    const res = await placePendingSeeds(db, m.map.id, { llm: second.llm, fetchImpl: noFetch, log: quiet });
    expect(second.prompts).toHaveLength(0);
    expect(res).toEqual({ attached: [], newMap: 0, dismissed: 0, pending: 0 });
  });
});

describe("placePendingSeeds: link seeds", () => {
  const URL_ = "https://example.com/stoic-essay?utm_source=x";
  const html = (title: string) => `<html><head><title>${title}</title></head><body>hi</body></html>`;
  const attach = (parentId: number) => ({
    action: "attach",
    parentId,
    title: "Stoic essay",
    blurb: "What does an essay on Stoic practice say?",
    kind: "text",
    reason: "An essay on Stoicism.",
  });

  it("verifies a web reading and stores it for the new node", async () => {
    const db = makeDb();
    const m = seedMap(db);
    const seed = addSeed(db, `A Stoic essay on practice ${URL_}`);
    expect(seed.kind).toBe("url");
    expect(seed.url).toBe(URL_);
    const fetched: string[] = [];
    const fetchImpl: FetchLike = async (url) => {
      fetched.push(url);
      return new Response(html("A Stoic essay on practice | Example Journal"), { status: 200 });
    };
    const res = await placePendingSeeds(db, m.map.id, { llm: placer(attach(m.b.id)).llm, fetchImpl, log: quiet });

    expect(fetched).toEqual([URL_]);
    const nodeId = res.attached[0].nodeId;
    const readings = db
      .select()
      .from(schema.atlasReadings)
      .where(eq(schema.atlasReadings.nodeId, nodeId))
      .all();
    expect(readings).toHaveLength(1);
    expect(readings[0]).toMatchObject({
      kind: "web",
      status: "verified",
      verifiedVia: "url_title",
      proposedBy: "seed",
      title: "A Stoic essay on practice",
      url: "https://example.com/stoic-essay", // tracking params stripped by the verifier
    });
  });

  it("stores a failed verification as rejected, with its reason", async () => {
    const db = makeDb();
    const m = seedMap(db);
    addSeed(db, URL_);
    const fetchImpl: FetchLike = async () =>
      new Response(html("Totally unrelated cooking blog"), { status: 200 });
    const res = await placePendingSeeds(db, m.map.id, { llm: placer(attach(m.b.id)).llm, fetchImpl, log: quiet });

    // the node is still created: the link is a bonus, never the gate
    expect(res.attached).toHaveLength(1);
    const readings = db
      .select()
      .from(schema.atlasReadings)
      .where(eq(schema.atlasReadings.nodeId, res.attached[0].nodeId))
      .all();
    expect(readings).toHaveLength(1);
    expect(readings[0].status).toBe("rejected");
    expect(readings[0].rejectReason).toContain("title mismatch");
    expect(readings[0].proposedBy).toBe("seed");
  });

  it("a non-link seed never touches the network", async () => {
    const db = makeDb();
    const m = seedMap(db);
    addSeed(db, "Meditations");
    let fetched = 0;
    const fetchImpl: FetchLike = async () => {
      fetched += 1;
      return new Response("", { status: 404 });
    };
    await placePendingSeeds(db, m.map.id, { llm: placer(attach(m.b.id)).llm, fetchImpl, log: quiet });
    expect(fetched).toBe(0);
    expect(db.select().from(schema.atlasReadings).all()).toHaveLength(0);
  });
});

describe("the frontier prefers a seed node", () => {
  const fnode = (id: number, parentId: number | null, position: number, extra: Partial<FrontierNode> = {}): FrontierNode => ({
    id,
    parentId,
    position,
    skipped: false,
    visitedAt: null,
    lastOpenedAt: null,
    ...extra,
  });

  it("pickFrontierNode: an eligible seed node outranks the ordering, oldest first", () => {
    const nodes = [
      fnode(1, null, 0),
      fnode(2, 1, 0),
      fnode(3, null, 1),
      fnode(4, 3, 0, { seedId: 8 }),
      fnode(5, 3, 1, { seedId: 9 }),
    ];
    expect(pickFrontierNode(nodes)).toEqual({ nodeId: 4, reason: "seed" });
    // once picked, the next seed goes; then the normal ordering resumes
    expect(pickFrontierNode(nodes, { pickedIds: [4] })).toEqual({ nodeId: 5, reason: "seed" });
    expect(pickFrontierNode(nodes, { pickedIds: [4, 5] })?.reason).not.toBe("seed");
  });

  it("a visited or skipped seed node does not win", () => {
    const visited = [fnode(1, null, 0), fnode(2, 1, 0, { seedId: 1, visitedAt: new Date() })];
    expect(pickFrontierNode(visited, { anchorId: null })).toEqual({ nodeId: 1, reason: "fallback" });
    const skipped = [fnode(1, null, 0), fnode(2, 1, 0, { seedId: 1, skipped: true })];
    expect(pickFrontierNode(skipped, { anchorId: null })).toEqual({ nodeId: 1, reason: "fallback" });
  });

  it("runWeeklyFrontier picks a freshly attached seed node with reason 'seed'", async () => {
    const db = makeDb();
    const m = seedMap(db);
    addSeed(db, "Meditations");
    const placed = await placePendingSeeds(db, m.map.id, {
      llm: placer({
        action: "attach",
        parentId: m.b.id,
        title: "Meditations of Marcus",
        blurb: "What does a Stoic emperor tell himself?",
        kind: "text",
        reason: "A Stoic text.",
      }).llm,
      fetchImpl: noFetch,
      log: quiet,
    });
    const seedNodeId = placed.attached[0].nodeId;

    const words = (n: number, p = "w") => Array.from({ length: n }, (_, i) => `${p}${i}`).join(" ");
    const quiz: QuizQuestion[] = [
      { question: "What is it?", choices: ["Alpha", "Beta", "Gamma", "Delta"], answer: 0, why: "Stated first." },
      { question: "Which move?", choices: ["One", "Two", "Three", "Four"], answer: 1, why: "The core." },
      { question: "Where now?", choices: ["Here", "There", "Everywhere", "Nowhere"], answer: 2, why: "Last section." },
    ];
    const llm: AtlasLlm = (prompt, zschema, opts) => {
      if (prompt.includes("Write the ONE-PAGER")) {
        return zschema.parse({
          hook: "A hook",
          body_md: `### The question\n${words(120)}\n\n### The move\n${words(120, "m")}\n\n### Where it bites\n${words(110, "b")}`,
          readings: [],
          quiz,
        });
      }
      if (prompt.includes("Write the DEEP DIVE")) {
        return zschema.parse({
          hook: "Deeper",
          body_md: ["Origins", "Figures", "Debates", "Influence", "Misreadings"]
            .map((h, i) => `### ${h}\n${words(200, `d${i}`)}`)
            .join("\n\n"),
          readings: [],
        });
      }
      if (opts.label === "deepdive judge") return zschema.parse({ verdict: "approve", problems: [], fixes: [] });
      throw new Error(`unexpected prompt: ${prompt.slice(0, 60)}`);
    };
    const sent: Array<{ subject: string; html: string }> = [];
    const res = await runWeeklyFrontier(db, {
      llm,
      fetchImpl: noFetch,
      send: async (input) => {
        sent.push(input);
        return { sent: true, id: "r1" };
      },
      now: new Date(2026, 10, 4, 6, 30),
      log: quiet,
      baseUrl: "https://sprout.example",
    });
    expect(res.status).toBe("delivered");
    const picks = db.select().from(schema.atlasFrontierPicks).all();
    expect(picks).toHaveLength(1);
    expect(picks[0]).toMatchObject({ nodeId: seedNodeId, reason: "seed" });
    expect(sent[0].subject).toContain("Meditations of Marcus");
  });
});
