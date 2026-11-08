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
  FRONTIER_CLAIM_STALE_MS,
  activeMapId,
  claimFrontierWeek,
  currentPick,
  deliverablePickView,
  reclaimDeadClaims,
  type PickRow,
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
    // All four buttons since PR3 added the save panel.
    expect(html).toContain(`href="${page}?from=note"`);
    expect(html).toContain(`href="${page}?rung=deepdive&amp;from=note"`);
    expect(html).toContain(`href="${page}?action=save&amp;from=note"`);
    expect(html).toContain(`href="${page}?action=skip&amp;from=note"`);
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

  it("two runs racing on one week: exactly one picks and emails, the other is already-delivered", async () => {
    const db = makeDb();
    seed(db);
    const { sent, send } = capturingSend();
    const { calls, llm } = fakeLlm();
    const results = await Promise.all([run(db, { send, llm }), run(db, { send, llm })]);
    expect(results.map((r) => r.status).sort()).toEqual(["already-delivered", "delivered"]);
    expect(sent).toHaveLength(1);
    // The loser never drafted: one one-pager, one deep dive, one judge.
    expect(calls).toEqual(["onepager draft", "deepdive draft", "deepdive judge"]);
    const picks = db.select().from(schema.atlasFrontierPicks).all();
    expect(picks).toHaveLength(1);
    expect(picks[0].attempt).toBe(0);
  });

  it("claims the week before drafting, so the row exists while the rungs are written", async () => {
    const db = makeDb();
    const { a } = seed(db);
    const base = fakeLlm().llm;
    const duringDraft: Array<{ nodeId: number; attempt: number | null } | null> = [];
    const llm: AtlasLlm = (prompt, zschema, opts) => {
      const p = currentPick(db, "2026-11-02");
      duringDraft.push(p && { nodeId: p.nodeId, attempt: p.attempt });
      return base(prompt, zschema, opts);
    };
    expect((await run(db, { llm })).status).toBe("delivered");
    expect(duringDraft[0]).toEqual({ nodeId: a.id, attempt: 0 });
  });

  it("--force numbers the week's attempts 0, 1, 2… and a normal run after a forced one is a no-op", async () => {
    const db = makeDb();
    seed(db);
    const { sent, send } = capturingSend();
    // A forced run on an empty week takes attempt 0 — the slot a normal run would claim.
    for (let i = 0; i < 3; i++) expect((await run(db, { send, force: true })).status).toBe("delivered");
    const attempts = db
      .select()
      .from(schema.atlasFrontierPicks)
      .all()
      .map((p) => p.attempt);
    expect(attempts).toEqual([0, 1, 2]);
    expect((await run(db, { send })).status).toBe("already-delivered");
    expect(sent).toHaveLength(3);
  });

  it("a failed forced re-run withdraws only its own claim; the earlier pick stays current", async () => {
    const db = makeDb();
    seed(db);
    const first = await run(db);
    expect(first.status).toBe("delivered");
    const llm: AtlasLlm = () => {
      throw new Error("model fell over");
    };
    expect((await run(db, { llm, force: true })).status).toBe("failed");
    const picks = db.select().from(schema.atlasFrontierPicks).all();
    expect(picks).toHaveLength(1);
    expect(currentPick(db, "2026-11-02")!.id).toBe(first.status === "delivered" && first.pick.id);
    // The withdrawn attempt number is free again.
    expect((await run(db, { force: true })).status).toBe("delivered");
    expect(db.select().from(schema.atlasFrontierPicks).all().map((p) => p.attempt)).toEqual([0, 1]);
  });

  describe("dead claims (a run killed mid-draft)", () => {
    const minutesBefore = (m: number) => new Date(WED.getTime() - m * 60_000);
    const leaveClaim = (db: DB, nodeId: number, mapId: number, createdAt: Date, force = false) =>
      claimFrontierWeek(
        db,
        { mapId, nodeId, weekStart: "2026-11-02", reason: "fallback", deliveredVia: "email", createdAt },
        force,
      )!;
    const readyOnepager = (db: DB, nodeId: number) =>
      db.insert(schema.atlasRungs)
        .values({ nodeId, level: "onepager", status: "ready", hook: "Hook", bodyMd: ONEPAGER })
        .run();

    it("reclaims a stale claim whose one-pager never got written, and delivers the week", async () => {
      const db = makeDb();
      const { map, a } = seed(db);
      const dead = leaveClaim(db, a.id, map.id, minutesBefore(FRONTIER_CLAIM_STALE_MS / 60_000 + 1));
      const { sent, send } = capturingSend();
      const res = await run(db, { send });
      expect(res).toMatchObject({ status: "delivered", pick: { nodeId: a.id, attempt: 0 } });
      expect(res.status === "delivered" && res.pick.id).not.toBe(dead.id);
      expect(sent).toHaveLength(1);
      expect(db.select().from(schema.atlasFrontierPicks).all()).toHaveLength(1);
    });

    it("leaves a fresh unready claim alone (a live run is still drafting it)", async () => {
      const db = makeDb();
      const { map, a } = seed(db);
      const live = leaveClaim(db, a.id, map.id, minutesBefore(10));
      const { sent, send } = capturingSend();
      expect(await run(db, { send })).toMatchObject({ status: "already-delivered", pick: { id: live.id } });
      expect(sent).toHaveLength(0);
    });

    it("never reclaims an old pick whose one-pager is ready, even if it was not emailed", async () => {
      const db = makeDb();
      const { map, a } = seed(db);
      readyOnepager(db, a.id);
      const kept = leaveClaim(db, a.id, map.id, minutesBefore(24 * 60));
      expect(kept.emailSentAt).toBeNull();
      const { sent, send } = capturingSend();
      expect(await run(db, { send })).toMatchObject({ status: "already-delivered", pick: { id: kept.id } });
      expect(sent).toHaveLength(0);
    });

    it("a dead forced attempt falls back to the week's delivered pick", async () => {
      const db = makeDb();
      const { map, b2 } = seed(db);
      const first = await run(db, { now: minutesBefore(120) });
      expect(first.status).toBe("delivered");
      leaveClaim(db, b2.id, map.id, minutesBefore(60), true); // attempt 1, never drafted
      const { sent, send } = capturingSend();
      const res = await run(db, { send });
      expect(res).toMatchObject({ status: "already-delivered", pick: { attempt: 0 } });
      expect(sent).toHaveLength(0);
      expect(db.select().from(schema.atlasFrontierPicks).all().map((p) => p.attempt)).toEqual([0]);
    });

    it("a run whose claim was reclaimed while it drafted does not send", async () => {
      const db = makeDb();
      seed(db);
      const base = fakeLlm().llm;
      const later = new Date(WED.getTime() + FRONTIER_CLAIM_STALE_MS + 60_000);
      const reclaimed: Array<PickRow | null> = [];
      const llm: AtlasLlm = (prompt, zschema, opts) => {
        // Mid one-pager (not ready yet), a later run decides this claim is dead.
        if (opts.label === "onepager draft") reclaimed.push(reclaimDeadClaims(db, "2026-11-02", later));
        return base(prompt, zschema, opts);
      };
      const { sent, send } = capturingSend();
      const res = await run(db, { send, llm });
      expect(reclaimed).toEqual([null]);
      // Drafting itself succeeded; only the delivery was refused.
      expect(res).toMatchObject({ status: "failed", error: expect.stringContaining("reclaimed") });
      expect(sent).toHaveLength(0);
      expect(db.select().from(schema.atlasFrontierPicks).all()).toHaveLength(0);
    });
  });

  it("the digest's pick is only deliverable once its one-pager is ready", async () => {
    const db = makeDb();
    const { map, a } = seed(db);
    claimFrontierWeek(db, {
      mapId: map.id,
      nodeId: a.id,
      weekStart: "2026-11-02",
      reason: "fallback",
      deliveredVia: "digest",
    });
    expect(currentPick(db, "2026-11-02")).not.toBeNull();
    expect(deliverablePickView(db, "2026-11-02")).toBeNull(); // still drafting
    db.insert(schema.atlasRungs)
      .values({ nodeId: a.id, level: "onepager", status: "ready", hook: "Hook", bodyMd: ONEPAGER })
      .run();
    expect(deliverablePickView(db, "2026-11-02")).toMatchObject({
      node: { id: a.id, hook: "Hook" },
      ready: { onepager: true },
    });
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

describe("claimFrontierWeek", () => {
  const values = (db: DB, weekStart = "2026-11-02") => {
    const { map, a } = seed(db);
    return { mapId: map.id, nodeId: a.id, weekStart, reason: "fallback" as const, deliveredVia: "email" as const };
  };

  it("a normal claim takes attempt 0 once; a second normal claim on the week gets null", () => {
    const db = makeDb();
    const v = values(db);
    expect(claimFrontierWeek(db, v)).toMatchObject({ attempt: 0, weekStart: "2026-11-02" });
    expect(claimFrontierWeek(db, v)).toBeNull();
    expect(db.select().from(schema.atlasFrontierPicks).all()).toHaveLength(1);
    // Another week is its own claim.
    expect(claimFrontierWeek(db, { ...v, weekStart: "2026-11-09" })).toMatchObject({ attempt: 0 });
  });

  it("a forced claim takes max(attempt)+1 for its week only", () => {
    const db = makeDb();
    const v = values(db);
    claimFrontierWeek(db, { ...v, weekStart: "2026-10-26" }, true);
    claimFrontierWeek(db, { ...v, weekStart: "2026-10-26" }, true);
    expect(claimFrontierWeek(db, v, true)).toMatchObject({ attempt: 0 });
    expect(claimFrontierWeek(db, v)).toBeNull();
    expect(claimFrontierWeek(db, v, true)).toMatchObject({ attempt: 1 });
    expect(claimFrontierWeek(db, v, true)).toMatchObject({ attempt: 2 });
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
