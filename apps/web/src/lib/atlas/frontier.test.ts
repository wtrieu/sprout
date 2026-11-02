import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "../../db/schema";
import type { DB } from "../../db/client";
import { getSetting, setSetting } from "../settings";
import { logEvent } from "./events";
import {
  activeMapId,
  currentPick,
  pickOpened,
  pickView,
  runWeeklyFrontier,
  weekStartOf,
} from "./frontier";
import type { AtlasLlm } from "./llm";
import type { QuizQuestion } from "./rungs";
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

const words = (n: number, prefix = "w") =>
  Array.from({ length: n }, (_, i) => `${prefix}${i}`).join(" ");
const ONEPAGER = `### The question\n${words(120)}\n\n### The move\n${words(120, "m")}\n\n### Where it bites\n${words(110, "b")}`;
const DEEPDIVE = ["Origins", "Figures", "Debates", "Influence", "Misreadings"]
  .map((h, i) => `### ${h}\n${words(200, `d${i}`)}`)
  .join("\n\n");

const QUIZ: QuizQuestion[] = [
  { question: "What is the live question?", choices: ["Alpha", "Beta", "Gamma", "Delta"], answer: 0, why: "The page opens on it." },
  { question: "Which move defines the school?", choices: ["One", "Two", "Three", "Four"], answer: 1, why: "It is the core move." },
  { question: "Where does it still bite today?", choices: ["Here", "There", "Everywhere", "Nowhere"], answer: 2, why: "The last section says." },
];

/** Two branches, two children each. Node ids: a=1 a1=2 a2=3 b=4 b1=5 b2=6. */
const seed = (db: DB, status: "ready" | "drafting" = "ready") => {
  const map = db
    .insert(schema.atlasMaps)
    .values({ title: "Philosophy", blurb: "How to live, what is real.", status })
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
  return { map, a, a1, a2, b, b1, b2, all: [a, a1, a2, b, b1, b2] };
};

const titleOf = (prompt: string): string =>
  /THIS NODE \([a-z]+\): ([^—]+) —/.exec(prompt)?.[1]?.trim() ?? "?";

/** Canned model: records every call; proposes one Wikipedia reading per one-pager. */
const fakeLlm = () => {
  const calls: string[] = [];
  const llm: AtlasLlm = (prompt, zschema, opts) => {
    calls.push(opts.label ?? "?");
    if (prompt.includes("Write the ONE-PAGER")) {
      const title = titleOf(prompt);
      return zschema.parse({
        hook: `Hook: ${title}`,
        body_md: ONEPAGER,
        readings: [{ kind: "wikipedia", title, why: "the overview" }],
        quiz: QUIZ,
      });
    }
    if (prompt.includes("Write the DEEP DIVE")) {
      return zschema.parse({ hook: "Deeper", body_md: DEEPDIVE, readings: [] });
    }
    if (opts.label === "deepdive judge") return zschema.parse({ verdict: "approve", problems: [], fixes: [] });
    throw new Error(`unexpected prompt: ${prompt.slice(0, 80)}`);
  };
  return { calls, llm };
};

const WIKI = "https://en.wikipedia.org/api/rest_v1/page/summary/";
/** Every Wikipedia summary resolves to a page titled like the slug. */
const wikiFetch: FetchLike = async (url) => {
  if (!url.startsWith(WIKI)) return new Response("{}", { status: 404 });
  const title = decodeURIComponent(url.slice(WIKI.length).split("?")[0]).replace(/_/g, " ");
  return new Response(
    JSON.stringify({
      type: "standard",
      title,
      extract: `${title} is a thing. More.`,
      content_urls: { desktop: { page: `https://en.wikipedia.org/wiki/${title.replace(/ /g, "_")}` } },
    }),
    { status: 200 },
  );
};

const capturingSend = () => {
  const sent: Array<{ subject: string; html: string }> = [];
  const send = async (input: { subject: string; html: string }) => {
    sent.push(input);
    return { sent: true, id: `resend-${sent.length}` };
  };
  return { sent, send };
};

const quiet = () => {};
// A Wednesday, 06:30 local — the launchd slot. Its Monday is 2026-11-02.
const WED = new Date(2026, 10, 4, 6, 30);
const BASE = "https://sprout.example";

const run = (db: DB, deps: Partial<Parameters<typeof runWeeklyFrontier>[1]> = {}) => {
  const { llm } = fakeLlm();
  // Never the real sender: a RESEND_API_KEY in the environment must not mail from a test.
  const { send } = capturingSend();
  return runWeeklyFrontier(db, { llm, send, fetchImpl: wikiFetch, now: WED, log: quiet, baseUrl: BASE, ...deps });
};

const addPlayer = (db: DB, email: string, name = email) =>
  db.insert(schema.atlasPlayers).values({ email, name, persona: "cartographer" }).returning().get();

const noteEvents = (db: DB) =>
  db.select().from(schema.atlasEvents).where(eq(schema.atlasEvents.verb, "frontier_note")).all();

describe("weekStartOf", () => {
  it("is the ISO date of the Monday on or before the day", () => {
    expect(weekStartOf(new Date(2026, 10, 4, 6, 30))).toBe("2026-11-02"); // Wed
    expect(weekStartOf(new Date(2026, 10, 2, 0, 0))).toBe("2026-11-02"); // Mon
    expect(weekStartOf(new Date(2026, 10, 8, 23, 59))).toBe("2026-11-02"); // Sun
    expect(weekStartOf(new Date(2026, 10, 9, 0, 1))).toBe("2026-11-09"); // next Mon
    expect(weekStartOf(new Date(2026, 0, 1, 12))).toBe("2025-12-29"); // across a year
  });
});

describe("activeMapId", () => {
  it("is null with no ready map, then the oldest ready map", () => {
    const db = makeDb();
    expect(activeMapId(db)).toBeNull();
    seed(db, "drafting");
    expect(activeMapId(db)).toBeNull();
    const first = seed(db);
    seed(db);
    expect(activeMapId(db)).toBe(first.map.id);
  });

  it("honors atlasActiveMapId while that map is ready, else falls back", () => {
    const db = makeDb();
    const first = seed(db);
    const second = seed(db);
    const drafting = seed(db, "drafting");
    setSetting(db, "atlasActiveMapId", second.map.id);
    expect(activeMapId(db)).toBe(second.map.id);
    setSetting(db, "atlasActiveMapId", drafting.map.id);
    expect(activeMapId(db)).toBe(first.map.id);
    setSetting(db, "atlasActiveMapId", 9999);
    expect(activeMapId(db)).toBe(first.map.id);
  });
});

describe("settings", () => {
  it("defaults to email delivery and no chosen map", () => {
    const db = makeDb();
    expect(getSetting(db, "atlasDelivery")).toBe("email");
    expect(getSetting(db, "atlasActiveMapId")).toBeNull();
  });
});

describe("runWeeklyFrontier", () => {
  it("does nothing when no map is ready", async () => {
    const db = makeDb();
    seed(db, "drafting");
    const { sent, send } = capturingSend();
    expect(await run(db, { send })).toEqual({ status: "no-map" });
    expect(sent).toHaveLength(0);
    expect(db.select().from(schema.atlasFrontierPicks).all()).toHaveLength(0);
  });

  it("picks, drafts both rungs, writes the row, and emails the note", async () => {
    const db = makeDb();
    const { map, a } = seed(db);
    db.insert(schema.children).values({ name: "Mina", dob: "2024-05-01" }).run();
    const { sent, send } = capturingSend();
    const { calls, llm } = fakeLlm();

    const res = await run(db, { send, llm });
    expect(res.status).toBe("delivered");

    // A fresh map has no anchor: the fallback is the first branch in map order.
    const pick = currentPick(db, "2026-11-02")!;
    expect(pick).toMatchObject({ mapId: map.id, nodeId: a.id, reason: "fallback", deliveredVia: "email" });
    expect(pick.emailSentAt).not.toBeNull();
    expect(pick.resendId).toBe("resend-1");

    // "Go deeper" lands on a ready page: both rungs are ready already.
    const rungs = db.select().from(schema.atlasRungs).where(eq(schema.atlasRungs.nodeId, a.id)).all();
    expect(rungs.map((r) => `${r.level}:${r.status}`).sort()).toEqual(["deepdive:ready", "onepager:ready"]);
    expect(calls).toEqual(["onepager draft", "deepdive draft", "deepdive judge"]);

    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe("Atlas · The Presocratics");
    const html = sent[0].html;
    const page = `${BASE}/atlas/${map.id}/${a.id}`;
    // Three buttons now; the spec's fourth ("Save for the child") waits for PR3.
    expect(html).toContain(`href="${page}?from=note"`);
    expect(html).toContain(`href="${page}?rung=deepdive&amp;from=note"`);
    expect(html).toContain(`href="${page}?action=skip&amp;from=note"`);
    expect(html).not.toContain("action=save");
    expect(html).toContain("This week in Atlas · Philosophy</p>"); // a branch node has no branch crumb
    expect(html).toContain("<strong>Hook: The Presocratics</strong>");
    expect(html).toContain("Read next");
    expect(html).toContain('href="https://en.wikipedia.org/wiki/The_Presocratics"');
    expect(html).toContain("0/6 visited");

    // The row is also what the UI reads.
    const view = pickView(db, pick)!;
    expect(view).toMatchObject({
      reason: "fallback",
      deliveredVia: "email",
      opened: false,
      node: { id: a.id, title: "The Presocratics", hook: "Hook: The Presocratics", mapId: map.id, branchTitle: null },
      ready: { onepager: true, deepdive: true },
    });
  });

  it("is idempotent within a week: a second run says already delivered and sends nothing", async () => {
    const db = makeDb();
    seed(db);
    const { sent, send } = capturingSend();
    const first = await run(db, { send });
    expect(first.status).toBe("delivered");

    const { calls, llm } = fakeLlm();
    const second = await run(db, { send, llm });
    expect(second.status).toBe("already-delivered");
    expect(calls).toEqual([]);
    expect(sent).toHaveLength(1);
    expect(db.select().from(schema.atlasFrontierPicks).all()).toHaveLength(1);

    // The next week is a fresh note, on a different node.
    const nextWeek = await run(db, { send, now: new Date(2026, 10, 11, 6, 30) });
    expect(nextWeek.status).toBe("delivered");
    expect(sent).toHaveLength(2);
    const picks = db.select().from(schema.atlasFrontierPicks).all();
    expect(new Set(picks.map((p) => p.nodeId)).size).toBe(2);
    expect(picks.map((p) => p.weekStart)).toEqual(["2026-11-02", "2026-11-09"]);
  });

  it("app and digest delivery write the pick and send nothing", async () => {
    for (const via of ["app", "digest"] as const) {
      const db = makeDb();
      const { a } = seed(db);
      setSetting(db, "atlasDelivery", via);
      const { sent, send } = capturingSend();
      const res = await run(db, { send });
      expect(res).toMatchObject({ status: "delivered", via, emailed: false });
      expect(sent).toHaveLength(0);
      const pick = currentPick(db, "2026-11-02")!;
      expect(pick).toMatchObject({ nodeId: a.id, deliveredVia: via, emailSentAt: null, resendId: null });
      // The note is still fully pre-drafted so the cards can say "ready".
      expect(pickView(db, pick)!.ready).toEqual({ onepager: true, deepdive: true });
    }
  });

  it("--force adds a second pick the same week and never repeats a node", async () => {
    const db = makeDb();
    const { all } = seed(db);
    const { sent, send } = capturingSend();
    const seen: number[] = [];
    for (let i = 0; i < all.length; i++) {
      const res = await run(db, { send, force: true });
      expect(res.status).toBe("delivered");
      seen.push(currentPick(db, "2026-11-02")!.nodeId);
    }
    expect(new Set(seen).size).toBe(all.length);
    expect(sent).toHaveLength(all.length);
    expect(db.select().from(schema.atlasFrontierPicks).all()).toHaveLength(all.length);

    // The map is exhausted: every node has been picked once.
    expect(await run(db, { send, force: true })).toMatchObject({ status: "complete" });
    expect(sent).toHaveLength(all.length);
  });

  it("a forced re-run also skips nodes the household has since visited", async () => {
    const db = makeDb();
    const { a1, a2 } = seed(db);
    const p = addPlayer(db, "p@example.com");
    logEvent(db, { playerId: p.id, verb: "open_node", nodeId: a1.id, at: new Date(2026, 10, 3) });
    const first = await run(db, { force: true });
    expect(first).toMatchObject({ status: "delivered", pick: { nodeId: a2.id, reason: "sibling" } });
    const second = await run(db, { force: true });
    expect(second.status === "delivered" && second.pick.nodeId).not.toBe(a1.id);
    expect(second.status === "delivered" && second.pick.nodeId).not.toBe(a2.id);
  });

  it("derives where we left off and what is visited from the event log, across players", async () => {
    const db = makeDb();
    const { map, a1, a2, b1, b2 } = seed(db);
    const mina = addPlayer(db, "mina@example.com");
    const sam = addPlayer(db, "sam@example.com");
    // One player opened Heraclitus; another opened Stoicism later; a third
    // fact is only a rung read (no open_node) on Thales — still "seen".
    logEvent(db, { playerId: mina.id, verb: "open_node", mapId: map.id, nodeId: a2.id, at: new Date(2026, 10, 1, 9) });
    logEvent(db, { playerId: sam.id, verb: "open_node", mapId: map.id, nodeId: b1.id, at: new Date(2026, 10, 2, 9) });
    logEvent(db, { playerId: mina.id, verb: "read_rung", mapId: map.id, nodeId: a1.id, data: { level: "eli10" }, at: new Date(2026, 10, 2, 10) });
    // The legacy columns disagree on purpose; with players they are ignored.
    db.update(schema.atlasNodes)
      .set({ visitedAt: new Date(2026, 10, 3), lastOpenedAt: new Date(2026, 10, 3) })
      .where(eq(schema.atlasNodes.id, b2.id))
      .run();

    const { sent, send } = capturingSend();
    const res = await run(db, { send });
    // Anchor = Stoicism (the latest open_node, any player); next to it is its sibling.
    expect(res).toMatchObject({ status: "delivered", pick: { nodeId: b2.id, reason: "sibling" } });
    expect(sent[0].html).toContain("3/6 visited"); // Heraclitus, Stoicism, Thales
  });

  it("falls back to the legacy node columns only while no player exists", async () => {
    const db = makeDb();
    const { a2, a1 } = seed(db);
    db.update(schema.atlasNodes)
      .set({ visitedAt: new Date(2026, 10, 1), lastOpenedAt: new Date(2026, 10, 1) })
      .where(eq(schema.atlasNodes.id, a2.id))
      .run();
    const { sent, send } = capturingSend();
    const res = await run(db, { send });
    expect(res).toMatchObject({ status: "delivered", pick: { nodeId: a1.id, reason: "sibling" } });
    expect(sent[0].html).toContain("1/6 visited");
    expect(noteEvents(db)).toHaveLength(0); // nobody to log it for
  });

  it("logs one household frontier_note event per player, without engine side effects", async () => {
    const db = makeDb();
    const { map, a } = seed(db);
    const mina = addPlayer(db, "mina@example.com");
    const sam = addPlayer(db, "sam@example.com");
    const res = await run(db);
    expect(res.status).toBe("delivered");
    const pick = currentPick(db, "2026-11-02")!;

    const events = noteEvents(db);
    expect(events.map((e) => e.playerId).sort()).toEqual([mina.id, sam.id].sort());
    for (const e of events) {
      expect(e).toMatchObject({ mapId: map.id, nodeId: a.id });
      expect(JSON.parse(e.data!)).toEqual({
        pickId: pick.id,
        nodeId: a.id,
        weekStart: "2026-11-02",
        via: "email",
        household: true,
      });
    }
    // Not a player action: nothing was granted or queued.
    expect(db.select().from(schema.atlasAchievements).all()).toHaveLength(0);
    // And a note event does not count as the node being seen.
    const again = await run(db, { force: true });
    expect(again.status === "delivered" && again.pick.nodeId).not.toBe(a.id);
  });

  it("withdraws the pick when the email cannot be sent, so a retry can choose again", async () => {
    const db = makeDb();
    const { a } = seed(db);
    addPlayer(db, "mina@example.com");
    const res = await run(db, {
      send: async () => {
        throw new Error("Resend responded 500");
      },
    });
    expect(res).toMatchObject({ status: "failed" });
    expect(db.select().from(schema.atlasFrontierPicks).all()).toHaveLength(0);
    expect(noteEvents(db)).toHaveLength(0);

    const { sent, send } = capturingSend();
    const retry = await run(db, { send });
    expect(retry).toMatchObject({ status: "delivered", pick: { nodeId: a.id } });
    expect(sent).toHaveLength(1);
  });

  it("keeps the pick on a dry-run send (not sent, nothing stamped)", async () => {
    const db = makeDb();
    seed(db);
    const res = await run(db, { send: async () => ({ sent: false, id: null }) });
    expect(res).toMatchObject({ status: "delivered", emailed: false });
    const pick = currentPick(db, "2026-11-02")!;
    expect(pick).toMatchObject({ deliveredVia: "email", emailSentAt: null, resendId: null });
    expect((await run(db)).status).toBe("already-delivered");
  });

  it("fails loudly when the one-pager will not write, leaving no pick", async () => {
    const db = makeDb();
    seed(db);
    const { sent, send } = capturingSend();
    const llm: AtlasLlm = () => {
      throw new Error("model fell over");
    };
    const res = await run(db, { send, llm });
    expect(res.status).toBe("failed");
    expect(sent).toHaveLength(0);
    expect(db.select().from(schema.atlasFrontierPicks).all()).toHaveLength(0);
  });

  it("still sends the note, minus Go deeper, when only the deep dive fails", async () => {
    const db = makeDb();
    seed(db);
    const { sent, send } = capturingSend();
    const base = fakeLlm().llm;
    const llm: AtlasLlm = (prompt, zschema, opts) => {
      if (prompt.includes("Write the DEEP DIVE")) throw new Error("deep dive fell over");
      return base(prompt, zschema, opts);
    };
    const res = await run(db, { send, llm });
    expect(res.status).toBe("delivered");
    expect(sent[0].html).not.toContain("Go deeper");
    expect(pickView(db, currentPick(db, "2026-11-02")!)!.ready).toEqual({ onepager: true, deepdive: false });
  });
});

describe("pickOpened", () => {
  it("is true once any player opens the node at or after the pick", async () => {
    const db = makeDb();
    seed(db);
    const mina = addPlayer(db, "mina@example.com");
    const sam = addPlayer(db, "sam@example.com");
    await run(db);
    const pick = currentPick(db, "2026-11-02")!;
    const other = pick.nodeId + 1;
    expect(pickOpened(db, pick)).toBe(false);

    // An open from before the note does not count.
    logEvent(db, { playerId: mina.id, verb: "open_node", nodeId: pick.nodeId, at: new Date(2026, 10, 3) });
    expect(pickOpened(db, pick)).toBe(false);

    // Some other node opened after the note does not count either.
    logEvent(db, { playerId: sam.id, verb: "open_node", nodeId: other, at: new Date(2026, 10, 4, 9) });
    expect(pickOpened(db, pick)).toBe(false);

    logEvent(db, { playerId: sam.id, verb: "open_node", nodeId: pick.nodeId, data: { from: "note" }, at: new Date(2026, 10, 4, 9) });
    expect(pickOpened(db, pick)).toBe(true);
    expect(pickView(db, pick)!.opened).toBe(true);
  });

  it("uses the legacy openedAt stamp only while no player exists", async () => {
    const db = makeDb();
    seed(db);
    await run(db);
    const pick = currentPick(db, "2026-11-02")!;
    expect(pickOpened(db, pick)).toBe(false);
    db.update(schema.atlasFrontierPicks)
      .set({ openedAt: new Date(2026, 10, 4, 9) })
      .where(eq(schema.atlasFrontierPicks.id, pick.id))
      .run();
    expect(pickOpened(db, currentPick(db, "2026-11-02")!)).toBe(true);

    // Once a character exists, the stamp alone no longer answers.
    addPlayer(db, "mina@example.com");
    expect(pickOpened(db, currentPick(db, "2026-11-02")!)).toBe(false);
  });
});
