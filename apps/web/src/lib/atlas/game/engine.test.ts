import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "../../../db/schema";
import type { DB } from "../../../db/client";
import { eventData, eventsForPlayer } from "../events";
import type { AtlasLlm } from "../llm";
import { BASE_SLUGS, grantAchievement } from "./achievements";
import { GrantsSchema, backfillRareNodes, runEngine, type EngineDeps } from "./engine";
import { makeDb, makePlayer, open, pass, read, seedWorld } from "./testkit";

const day = (d: number, h = 12) => new Date(2026, 9, d, h, 0, 0);
const NOW = new Date(2026, 9, 20, 3, 0, 0);

type Grant = { slug: string; title: string; flavor: string; why: string; basisEventIds: number[] };

const grant = (slug: string, ids: number[]): Grant => ({
  slug,
  title: `Title ${slug}`,
  flavor: `You did the ${slug} thing.`,
  why: "a visible pattern",
  basisEventIds: ids,
});

/** A canned llm: records prompts, validates against the real schema like the adapter would. */
const canned = (grants: (prompt: string) => Grant[]) => {
  const prompts: string[] = [];
  const llm: AtlasLlm = ((prompt: string, schema: typeof GrantsSchema) => {
    prompts.push(prompt);
    // Parse leniently on length: the cap is the code's job, not the stub's.
    return { grants: grants(prompt) } as ReturnType<typeof schema.parse>;
  }) as unknown as AtlasLlm;
  return { llm, prompts };
};

const setup = () => {
  const db = makeDb();
  const w = seedWorld(db, 3, 5);
  const player = makePlayer(db);
  const [b1] = w.branches;
  const k = w.kids.get(b1!)!;
  // Old (outside the window) and recent (inside) activity.
  open(db, player.id, k[0]!, day(1));
  open(db, player.id, k[1]!, day(18));
  read(db, player.id, k[1]!, "deepdive", day(18, 13));
  pass(db, player.id, k[1]!, day(19));
  const ids = eventsForPlayer(db, player.id).map((e) => e.id);
  return { db, w, player, k, ids };
};

const modelRows = (db: DB) =>
  db
    .select()
    .from(schema.atlasAchievements)
    .where(eq(schema.atlasAchievements.source, "model"))
    .all();

const run = (db: DB, deps: EngineDeps) => runEngine(db, { now: NOW, ...deps });

describe("runEngine", () => {
  it("stores validated grants hidden, rolls loot, and flips the run row drafting -> ready", () => {
    const { db, player, ids } = setup();
    const recent = ids.slice(1);
    let statusDuringCall: string | undefined;
    const { llm, prompts } = canned(() => {
      statusDuringCall = db.select().from(schema.atlasEngineRuns).get()?.status;
      return [grant("deep-diver", [recent[1]!, recent[2]!])];
    });
    const result = run(db, { llm });

    expect(statusDuringCall).toBe("drafting");
    expect(result).toMatchObject({ status: "ready", grants: 1, error: null });
    const row = db.select().from(schema.atlasEngineRuns).get()!;
    expect(row).toMatchObject({ kind: "nightly", status: "ready", grantsCount: 1 });
    expect(row.windowEnd).toEqual(NOW);
    expect(row.windowStart).toEqual(new Date(2026, 9, 13, 3, 0, 0));

    const [stored] = modelRows(db);
    expect(stored).toMatchObject({
      playerId: player.id,
      slug: "deep-diver",
      title: "Title deep-diver",
      hidden: true,
      source: "model",
      revealedAt: null,
    });
    expect(JSON.parse(stored!.data!)).toMatchObject({ basisEventIds: [recent[1], recent[2]], why: "a visible pattern" });
    // Hidden: a cosmetic and a functional item.
    const items = db.select().from(schema.atlasItems).where(eq(schema.atlasItems.achievementId, stored!.id)).all();
    expect(items).toHaveLength(2);
    expect(eventsForPlayer(db, player.id).filter((e) => e.verb === "grant_achievement" && eventData(e).slug === "deep-diver")).toHaveLength(1);

    // The prompt: persona rules, compact event lines, the player's name, only in-window events.
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("family-friendly");
    expect(prompts[0]).toContain("never at the learner");
    expect(prompts[0]).toContain("Way");
    expect(prompts[0]).toContain(`#${recent[2]} read_rung deepdive "Node 1.2" [Branch 1] 2026-10-18 13:00`);
    expect(prompts[0]).not.toContain(`#${ids[0]} `);
  });

  it("drops grants with fake, out-of-window, or foreign basis ids, and taken slugs; never repairs", () => {
    const { db, w, ids } = setup();
    const other = makePlayer(db, "kid@x.y", "protege");
    open(db, other.id, w.all[0]!, day(18));
    const foreign = eventsForPlayer(db, other.id).find((e) => e.verb === "open_node")!.id;
    const { llm } = canned(() => [
      grant("fake-ids", [99999]),
      grant("mixed-ids", [ids[2]!, 99999]),
      grant("old-event", [ids[1]!]),
      grant("someone-elses", [foreign]),
      grant("first-open", [ids[2]!]), // a base slug the sweep already granted
      grant("keeper", [ids[2]!]),
    ]);
    // The stub ignores the schema cap; the code enforces it after validation.
    const result = run(db, { llm, playerId: 1 });
    expect(result.status).toBe("ready");
    expect(modelRows(db).map((r) => r.slug)).toEqual(["keeper"]);
    expect(db.select().from(schema.atlasAchievements).where(eq(schema.atlasAchievements.slug, "first-open")).all()[0]!.source).toBe("base");
  });

  it("caps a run at two grants per player", () => {
    const { db, ids } = setup();
    const { llm } = canned(() => [
      grant("one-a", [ids[2]!]),
      grant("two-b", [ids[2]!]),
      grant("three-c", [ids[2]!]),
    ]);
    expect(run(db, { llm })).toMatchObject({ grants: 2 });
    expect(modelRows(db).map((r) => r.slug)).toEqual(["one-a", "two-b"]);
    // And the schema the adapter validates against says the same.
    expect(GrantsSchema.safeParse({ grants: [1, 2, 3].map((i) => grant(`s-${i}`, [i])) }).success).toBe(false);
  });

  it("advances the window and is idempotent on re-run", () => {
    const { db, ids } = setup();
    let calls = 0;
    const { llm } = canned(() => {
      calls += 1;
      return [grant("deep-diver", [ids[2]!])];
    });
    const first = run(db, { llm });
    const second = run(db, { llm, now: new Date(NOW.getTime() + 24 * 3600 * 1000) });
    expect(second.windowStart).toEqual(first.windowEnd);
    // Nothing happened in the new window: no model call, no grants.
    expect(calls).toBe(1);
    expect(second).toMatchObject({ status: "ready", grants: 0 });
    expect(modelRows(db)).toHaveLength(1);
    expect(db.select().from(schema.atlasEngineRuns).all().map((r) => r.status)).toEqual(["ready", "ready"]);

    // Fresh activity in the new window, same slug proposed again: dropped as taken.
    const player = db.select().from(schema.atlasPlayers).get()!;
    open(db, player.id, 2, new Date(NOW.getTime() + 3600 * 1000));
    const newId = eventsForPlayer(db, player.id).at(-1)!.id;
    const third = run(db, {
      llm: canned(() => [grant("deep-diver", [newId])]).llm,
      now: new Date(NOW.getTime() + 48 * 3600 * 1000),
    });
    expect(third.grants).toBe(0);
    expect(modelRows(db)).toHaveLength(1);
  });

  it("marks the run failed on a model error and keeps the window for the retry", () => {
    const { db, ids } = setup();
    const boom: AtlasLlm = (() => {
      throw new Error("claude exploded");
    }) as unknown as AtlasLlm;
    const failed = run(db, { llm: boom });
    expect(failed.status).toBe("failed");
    expect(failed.error).toContain("claude exploded");
    expect(db.select().from(schema.atlasEngineRuns).get()).toMatchObject({ status: "failed" });

    // The retry re-covers the same window (no ready run advanced it).
    const retry = run(db, { llm: canned(() => [grant("ok-grant", [ids[2]!])]).llm });
    expect(retry).toMatchObject({ status: "ready", grants: 1 });
    expect(retry.windowStart).toEqual(failed.windowStart);
  });

  it("sweeps base achievements and skips players with no activity in the window", () => {
    const db = makeDb();
    const w = seedWorld(db);
    const idle = makePlayer(db, "idle@x.y");
    open(db, idle.id, w.all[0]!, day(1)); // long before the window
    let calls = 0;
    const result = run(db, { llm: canned(() => { calls += 1; return []; }).llm });
    expect(calls).toBe(0);
    expect(result.status).toBe("ready");
    // The nightly sweep catches base grants even if no hook ran.
    expect(db.select().from(schema.atlasAchievements).all().map((a) => a.slug)).toEqual(["first-open"]);
  });

  it("backfills one seeded child per branch on maps with no rare node, first run only", () => {
    const { db, w } = setup();
    // A second map that already has its own rare node is left alone.
    const w2 = seedWorld(db, 2, 4, "Biology");
    db.update(schema.atlasNodes).set({ rare: true }).where(eq(schema.atlasNodes.id, w2.all[0]!)).run();

    run(db, { llm: canned(() => []).llm });
    const rare = db.select().from(schema.atlasNodes).where(eq(schema.atlasNodes.rare, true)).all();
    const onFirst = rare.filter((n) => n.mapId === w.mapId);
    expect(onFirst).toHaveLength(3);
    for (const branch of w.branches) {
      const mine = onFirst.filter((n) => n.parentId === branch);
      expect(mine).toHaveLength(1);
    }
    expect(rare.filter((n) => n.mapId === w2.mapId).map((n) => n.id)).toEqual([w2.all[0]]);

    // Seeded: the same picks again on a fresh identical database; and a later run changes nothing.
    const before = rare.map((n) => n.id).sort();
    run(db, { llm: canned(() => []).llm, now: new Date(NOW.getTime() + 86400000) });
    expect(
      db.select().from(schema.atlasNodes).where(eq(schema.atlasNodes.rare, true)).all().map((n) => n.id).sort(),
    ).toEqual(before);
    expect(backfillRareNodes(db)).toBe(0);
  });
});

describe("run lifecycle", () => {
  it("reaps stale drafting runs to failed, leaving fresh ones alone", () => {
    const { db } = setup();
    const old = db
      .insert(schema.atlasEngineRuns)
      .values({ windowStart: day(1), windowEnd: day(2), createdAt: new Date(NOW.getTime() - 3600_000) })
      .returning()
      .get();
    const fresh = db
      .insert(schema.atlasEngineRuns)
      .values({ windowStart: day(1), windowEnd: day(2), createdAt: new Date(NOW.getTime() - 60_000) })
      .returning()
      .get();
    run(db, { llm: canned(() => []).llm });
    const status = (id: number) =>
      db.select().from(schema.atlasEngineRuns).where(eq(schema.atlasEngineRuns.id, id)).get()!.status;
    expect(status(old.id)).toBe("failed");
    expect(status(fresh.id)).toBe("drafting");
  });

  it("does not double-grant to a player an unfinished run already reached", () => {
    const { db, player, ids } = setup();
    // A run died after granting: its row is still drafting, no watermark moved.
    grantAchievement(db, player.id, {
      slug: "earlier-grant",
      title: "t",
      flavor: "f",
      source: "model",
      hidden: true,
      data: { basisEventIds: [ids[2]], runId: 999 },
    });
    let calls = 0;
    const result = run(db, {
      llm: canned(() => {
        calls += 1;
        return [grant("another", [ids[2]!])];
      }).llm,
    });
    expect(calls).toBe(0);
    expect(result.grants).toBe(0);
    expect(modelRows(db).map((r) => r.slug)).toEqual(["earlier-grant"]);
  });

  it("ad hoc runs keep their own window and never move the nightly watermark", () => {
    const { db } = setup();
    const first = run(db, { llm: canned(() => []).llm });
    const adhoc = run(db, {
      llm: canned(() => []).llm,
      playerId: 1,
      now: new Date(NOW.getTime() + 2 * 86400_000),
    });
    expect(
      db.select().from(schema.atlasEngineRuns).where(eq(schema.atlasEngineRuns.id, adhoc.runId)).get()!.kind,
    ).toBe("adhoc");
    // Default 7 days back, not the nightly watermark.
    expect(adhoc.windowStart).toEqual(new Date(adhoc.windowEnd.getTime() - 7 * 86400_000));

    const days = run(db, {
      llm: canned(() => []).llm,
      windowDays: 2,
      now: new Date(NOW.getTime() + 3 * 86400_000),
    });
    expect(days.windowStart).toEqual(new Date(days.windowEnd.getTime() - 2 * 86400_000));

    const nightly = run(db, { llm: canned(() => []).llm, now: new Date(NOW.getTime() + 4 * 86400_000) });
    expect(nightly.windowStart).toEqual(first.windowEnd);
  });

  it("refuses model grants that squat on base-rule slugs, and reserves them in the prompt", () => {
    const { db, ids } = setup();
    const { llm, prompts } = canned(() => [
      grant("night-owl", [ids[2]!]),
      grant("comeback", [ids[2]!]),
      grant("fine-slug", [ids[2]!]),
    ]);
    run(db, { llm });
    expect(modelRows(db).map((r) => r.slug)).toEqual(["fine-slug"]);
    expect(prompts[0]).toContain("Reserved slugs");
    expect(prompts[0]).toContain("night-owl");
    expect(BASE_SLUGS.has("night-owl")).toBe(true);
  });
});
