import { eq, isNotNull } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "../../../db/schema";
import type { DB } from "../../../db/client";
import { eventData, eventsForPlayer } from "../events";
import { checkBaseAchievements } from "./achievements";
import {
  CLASS_GATES,
  OFFER_DEADLINE_DAYS,
  acceptOffer,
  behaviorOf,
  buildOptions,
  classHistory,
  currentClass,
  defaultLapsedOffers,
  hasFogBonus,
  maybeCreateOffer,
  meetsSignalFloor,
  nextGateFor,
  parseOptions,
  rankPairings,
} from "./classes";
import { loadPlayerState } from "./data";
import { onEventsLogged } from "./hooks";
import { pendingFor, revealPending } from "./pending";
import { makeDb, makePlayer, master, open, pass, read, seedWorld } from "./testkit";

const day = (d: number, h = 12) => new Date(2026, 9, d, h, 0, 0);

/** Every child is tagged language, so affinity is unambiguous. */
const allLanguage = (db: DB) =>
  db
    .update(schema.atlasNodes)
    .set({ discipline: "language" })
    .where(isNotNull(schema.atlasNodes.parentId))
    .run();

/** Three branches of 15; master all of branch 1 (75 events, total level 10, one branch touched). */
const gateWorld = () => {
  const db = makeDb();
  const w = seedWorld(db, 3, 15);
  allLanguage(db);
  const player = makePlayer(db);
  for (const n of w.kids.get(w.branches[0]!)!) master(db, player.id, n, day(10));
  return { db, w, player };
};

describe("gates", () => {
  it("are the agreed list, and nextGate reports the next one above the level", () => {
    expect(CLASS_GATES).toEqual([10, 20, 35, 55, 80, 120, 160, 200]);
    expect(nextGateFor(5)).toEqual({ level: 5, at: 10 });
    expect(nextGateFor(10)).toEqual({ level: 10, at: 20 });
    expect(nextGateFor(199)).toEqual({ level: 199, at: 200 });
    expect(nextGateFor(200)).toBeNull();
  });
});

describe("behavior and ranking", () => {
  // Day 1: open b1k1, read eli10 + deepdive on it, open b2k1, pass b2k2
  // (two branches). Day 2: open b1k2, read its onepager, pass it (one branch).
  // Children rotate disciplines, so b1k1 is reasoning, b1k2 and b2k2 evidence.
  const small = () => {
    const db = makeDb();
    const w = seedWorld(db, 2, 5);
    const player = makePlayer(db);
    const [b1, b2] = w.branches;
    const b1k = w.kids.get(b1!)!;
    const b2k = w.kids.get(b2!)!;
    open(db, player.id, b1k[0]!, day(1));
    read(db, player.id, b1k[0]!, "eli10", day(1));
    read(db, player.id, b1k[0]!, "deepdive", day(1));
    open(db, player.id, b2k[0]!, day(1));
    pass(db, player.id, b2k[1]!, day(1));
    open(db, player.id, b1k[1]!, day(2));
    read(db, player.id, b1k[1]!, "onepager", day(2));
    pass(db, player.id, b1k[1]!, day(2));
    return { db, player };
  };

  it("computes each ratio exactly from a fixture log", () => {
    const { db, player } = small();
    const state = loadPlayerState(db, player.id);
    const b = behaviorOf(state.events, state.nodes);
    // 8 activity events plus create_character.
    expect(b.eventCount).toBe(9);
    expect(b.branchesTouched).toBe(2);
    expect(b.scout).toBeCloseTo(1); // 2 of the 2 branches on the map
    expect(b.scholar).toBeCloseTo(1 / 3); // 1 deep dive in 3 reads
    expect(b.skeptic).toBeCloseTo(1); // 2 quiz attempts over 2 nodes read
    expect(b.synthesist).toBeCloseTo(0.5); // 1 of 2 active days crossed branches
  });

  it("ranks affinity from discipline XP and style from the ratios", () => {
    const { db, player } = small();
    const state = loadPlayerState(db, player.id);
    const b = behaviorOf(state.events, state.nodes);
    // Evidence holds 100 XP (a read and two passes) against reasoning's 40, so it is the
    // affinity; scout (2.0) then scholar (1.33) lead the style scores.
    expect(state.disciplines.evidence.xp).toBe(100);
    expect(state.disciplines.reasoning.xp).toBe(40);
    const ranked = rankPairings(state, b);
    expect(ranked[0]).toMatchObject({ discipline: "evidence", style: "scout" });
    expect(ranked[0]!.score).toBeCloseTo((100 / 140) * 2);
    expect(ranked[1]).toMatchObject({ discipline: "evidence", style: "scholar" });
  });

  it("an empty log still ranks deterministically (declaration order)", () => {
    const db = makeDb();
    seedWorld(db);
    const player = makePlayer(db);
    const state = loadPlayerState(db, player.id);
    const ranked = rankPairings(state, behaviorOf(state.events, state.nodes));
    expect(ranked[0]).toMatchObject({ discipline: "reasoning", style: "scout" });
  });

  it("a short log is below the signal floor and yields no options", () => {
    const { db, player } = small();
    const state = loadPlayerState(db, player.id);
    expect(meetsSignalFloor(behaviorOf(state.events, state.nodes))).toBe(false);
    expect(buildOptions(db, player.id, state)).toBeNull();
  });

  it("names the top affinity by discipline: language is Lyrical", () => {
    const { db, w, player } = gateWorld();
    open(db, player.id, w.kids.get(w.branches[1]!)![0]!, day(11));
    const state = loadPlayerState(db, player.id);
    const options = buildOptions(db, player.id, state)!;
    expect(options[0]).toMatchObject({ affinity: "Lyrical", classId: expect.stringMatching(/^lyrical-/) });
    expect(options[1]!.affinity).toBe("Lyrical");
    expect(options[0]!.classId).not.toBe(options[1]!.classId);
    expect(options[2]).toBeNull();
    // Perk is data on every option.
    expect(options[0]!.perk.copy.length).toBeGreaterThan(10);
  });
});

describe("offers", () => {
  it("waits below the signal floor, then arrives once the second branch is touched", () => {
    const { db, w, player } = gateWorld();
    // Total level 10 (gate 10 crossed), 75 events, but only one branch touched.
    expect(loadPlayerState(db, player.id).total).toBe(10);
    expect(maybeCreateOffer(db, player.id)).toBeNull();
    expect(onEventsLogged(db, player.id).offer).toBeNull();
    expect(db.select().from(schema.atlasClassOffers).all()).toHaveLength(0);

    open(db, player.id, w.kids.get(w.branches[1]!)![0]!, day(11));
    const offer = onEventsLogged(db, player.id).offer!;
    expect(offer).toMatchObject({ gateLevel: 10, status: "queued", deadline: null });
    expect(parseOptions(offer)).toHaveLength(3);
  });

  it("makes one offer per gate, and none while one is undecided", () => {
    const { db, w, player } = gateWorld();
    open(db, player.id, w.kids.get(w.branches[1]!)![0]!, day(11));
    expect(maybeCreateOffer(db, player.id)).not.toBeNull();
    expect(maybeCreateOffer(db, player.id)).toBeNull();
    open(db, player.id, w.kids.get(w.branches[1]!)![1]!, day(11));
    expect(maybeCreateOffer(db, player.id)).toBeNull();
    expect(db.select().from(schema.atlasClassOffers).all()).toHaveLength(1);
  });

  it("queued -> revealed (14-day deadline) -> accepted, with a permanent history", () => {
    const { db, w, player } = gateWorld();
    open(db, player.id, w.kids.get(w.branches[1]!)![0]!, day(11));
    const offer = maybeCreateOffer(db, player.id)!;

    // The map shows it as pending; accepting before the reveal is refused.
    expect(pendingFor(db, player.id).offer).toMatchObject({ id: offer.id, status: "queued" });
    const options = parseOptions(offer);
    expect(acceptOffer(db, player.id, offer.id, options[0]!.classId)).toEqual({
      ok: false,
      error: "not-revealed",
    });

    const now = day(12);
    const shown = revealPending(db, player.id, now);
    const deadline = shown.offer!.deadline!;
    expect(shown.offer!.status).toBe("revealed");
    expect(deadline.getTime() - now.getTime()).toBe(OFFER_DEADLINE_DAYS * 24 * 3600 * 1000);
    expect(eventsForPlayer(db, player.id).filter((e) => e.verb === "offer_class")).toHaveLength(1);
    // A second reveal changes nothing.
    revealPending(db, player.id, day(13));
    expect(eventsForPlayer(db, player.id).filter((e) => e.verb === "offer_class")).toHaveLength(1);

    expect(acceptOffer(db, player.id, offer.id, "not-a-class")).toEqual({ ok: false, error: "bad-choice" });
    expect(acceptOffer(db, 999, offer.id, options[1]!.classId)).toEqual({ ok: false, error: "not-found" });
    const accepted = acceptOffer(db, player.id, offer.id, options[1]!.classId, { now: day(13) });
    expect(accepted.ok).toBe(true);
    expect(currentClass(db, player.id)).toMatchObject({ id: options[1]!.classId, title: options[1]!.title });
    expect(pendingFor(db, player.id).offer).toBeNull();

    const history = classHistory(eventsForPlayer(db, player.id));
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ classId: options[1]!.classId, gateLevel: 10, defaulted: false });
    // Decided: no new offer until the next gate (20).
    expect(maybeCreateOffer(db, player.id)).toBeNull();
  });

  it("past the soft deadline the first option is accepted, logged as defaulted", () => {
    const { db, w, player } = gateWorld();
    open(db, player.id, w.kids.get(w.branches[1]!)![0]!, day(11));
    const offer = maybeCreateOffer(db, player.id)!;
    revealPending(db, player.id, day(12));

    // Inside the window: untouched.
    expect(defaultLapsedOffers(db, player.id, day(20))).toBe(0);
    expect(currentClass(db, player.id)).toBeNull();

    const later = new Date(day(12).getTime() + (OFFER_DEADLINE_DAYS + 1) * 24 * 3600 * 1000);
    expect(defaultLapsedOffers(db, player.id, later)).toBe(1);
    expect(currentClass(db, player.id)!.id).toBe(parseOptions(offer)[0]!.classId);
    const ev = eventsForPlayer(db, player.id).find((e) => e.verb === "accept_class")!;
    expect(eventData(ev)).toMatchObject({ defaulted: true, offerId: offer.id });
    expect(defaultLapsedOffers(db, player.id, later)).toBe(0);
  });

  it("offers an unconsumed wildcard as the third option, and consumes it when chosen", () => {
    const { db, w, player } = gateWorld();
    const other = w.kids.get(w.branches[1]!)!;
    // Three late-night reads earn Night Owl and its wildcard class.
    for (const n of other.slice(0, 3)) read(db, player.id, n, "eli10", new Date(2026, 9, 11, 23, 30));
    checkBaseAchievements(db, player.id);
    const offer = maybeCreateOffer(db, player.id)!;
    const options = parseOptions(offer);
    expect(options[2]).toMatchObject({ classId: "night-watch", title: "Night Watch" });

    revealPending(db, player.id, day(12));
    expect(acceptOffer(db, player.id, offer.id, "night-watch").ok).toBe(true);
    expect(currentClass(db, player.id)!.title).toBe("Night Watch");
    const state = loadPlayerState(db, player.id);
    expect(buildOptions(db, player.id, state)![2]).toBeNull();
  });

  it("only the Scout style wires a perk (the fog bonus)", () => {
    const { db, w, player } = gateWorld();
    open(db, player.id, w.kids.get(w.branches[1]!)![0]!, day(11));
    const offer = maybeCreateOffer(db, player.id)!;
    revealPending(db, player.id, day(12));
    const options = parseOptions(offer);
    const scout = options.find((o) => o?.style === "Scout");
    const other = options.find((o) => o && o.style !== "Scout");
    const pick = scout ?? other!;
    acceptOffer(db, player.id, offer.id, pick.classId);
    expect(hasFogBonus(db, player.id)).toBe(pick.style === "Scout");
    expect(db.select().from(schema.atlasClassOffers).where(eq(schema.atlasClassOffers.status, "accepted")).all()).toHaveLength(1);
  });
});
