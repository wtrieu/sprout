import { eq, isNotNull } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "../../../db/schema";
import type { DB } from "../../../db/client";
import { eventsForPlayer } from "../events";
import { tierFor } from "../game";
import { mapProgressFor } from "../progress";
import { acceptOffer, currentClass, maybeCreateOffer, parseOptions } from "./classes";
import { loadPlayerState, revealedAcross } from "./data";
import { equipLoadout, parseLoadout } from "./loadout";
import { revealPending } from "./pending";
import { useItem } from "./items";
import { makeDb, makePlayer, master, open, seedWorld } from "./testkit";

const day = (d: number, h = 12) => new Date(2026, 9, d, h, 0, 0);

const give = (db: DB, playerId: number, kind: string, ref: string | null = null) =>
  db.insert(schema.atlasItems).values({ playerId, kind, ref }).returning().get();

const itemRow = (db: DB, id: number) =>
  db.select().from(schema.atlasItems).where(eq(schema.atlasItems.id, id)).get()!;

const verbs = (db: DB, playerId: number, verb: string) =>
  eventsForPlayer(db, playerId).filter((e) => e.verb === verb);

describe("fog_reveal", () => {
  it("reveals up to three fogged nodes nearest recent activity, as events", () => {
    const db = makeDb();
    const w = seedWorld(db, 3, 5);
    const player = makePlayer(db);
    const [b1, b2, b3] = w.branches;
    open(db, player.id, w.kids.get(b1!)![0]!, day(1));
    const before = revealedAcross(loadPlayerState(db, player.id), false);
    expect(w.kids.get(b2!)!.some((id) => before.has(id))).toBe(false);

    const item = give(db, player.id, "fog_reveal");
    const result = useItem(db, player.id, item.id);
    expect(result).toMatchObject({ ok: true, kind: "fog_reveal" });
    if (!result.ok) return;
    // The branch next door, first three children by position.
    expect(result.revealed).toEqual(w.kids.get(b2!)!.slice(0, 3));

    const reveals = verbs(db, player.id, "reveal_node");
    expect(reveals.map((e) => e.nodeId)).toEqual(result.revealed);
    expect(verbs(db, player.id, "use_item")).toHaveLength(1);
    expect(itemRow(db, item.id)).toMatchObject({ status: "consumed" });
    expect(itemRow(db, item.id).consumedAt).not.toBeNull();

    // Fog is derived from the log: the map now shows them, still unvisited.
    const progress = mapProgressFor(db, player.id, w.mapId);
    for (const id of result.revealed) {
      expect(progress.revealed).toContain(id);
      expect(progress.tiers[id]!.seen).toBe(false);
    }
    expect(progress.revealed).not.toContain(w.kids.get(b3!)![0]!);
    expect(tierFor(loadPlayerState(db, player.id).tiers, result.revealed[0]!).seen).toBe(false);

    // A used item cannot be used twice.
    expect(useItem(db, player.id, item.id)).toEqual({ ok: false, error: "not-usable" });
  });

  it("refuses, and keeps the item, when nothing is hidden", () => {
    const db = makeDb();
    const w = seedWorld(db, 1, 3);
    const player = makePlayer(db);
    open(db, player.id, w.kids.get(w.branches[0]!)![0]!, day(1));
    const item = give(db, player.id, "fog_reveal");
    expect(useItem(db, player.id, item.id)).toEqual({ ok: false, error: "nothing-to-reveal" });
    expect(itemRow(db, item.id).status).toBe("owned");
    expect(verbs(db, player.id, "use_item")).toHaveLength(0);
  });

  it("never touches another player's items", () => {
    const db = makeDb();
    seedWorld(db);
    const a = makePlayer(db, "a@x.y");
    const b = makePlayer(db, "b@x.y");
    const item = give(db, a.id, "fog_reveal");
    expect(useItem(db, b.id, item.id)).toEqual({ ok: false, error: "not-found" });
  });
});

describe("rare_node_key", () => {
  it("reveals the nearest unrevealed rare node and nothing else", () => {
    const db = makeDb();
    const w = seedWorld(db, 3, 5);
    const player = makePlayer(db);
    const [b1, b2, b3] = w.branches;
    const rareNear = w.kids.get(b2!)![3]!;
    const rareFar = w.kids.get(b3!)![1]!;
    for (const id of [rareNear, rareFar]) {
      db.update(schema.atlasNodes).set({ rare: true }).where(eq(schema.atlasNodes.id, id)).run();
    }
    open(db, player.id, w.kids.get(b1!)![0]!, day(1));

    const first = useItem(db, player.id, give(db, player.id, "rare_node_key").id);
    expect(first).toMatchObject({ ok: true, revealed: [rareNear] });
    const second = useItem(db, player.id, give(db, player.id, "rare_node_key").id);
    expect(second).toMatchObject({ ok: true, revealed: [rareFar] });
    expect(verbs(db, player.id, "reveal_node").map((e) => e.nodeId)).toEqual([rareNear, rareFar]);

    const third = give(db, player.id, "rare_node_key");
    expect(useItem(db, player.id, third.id)).toEqual({ ok: false, error: "nothing-to-reveal" });
    expect(itemRow(db, third.id).status).toBe("owned");
  });
});

describe("respec_token", () => {
  /** Total level 11, class accepted at gate 10. */
  const classed = () => {
    const db = makeDb();
    const w = seedWorld(db, 3, 15);
    db.update(schema.atlasNodes)
      .set({ discipline: "language" })
      .where(isNotNull(schema.atlasNodes.parentId))
      .run();
    const player = makePlayer(db);
    for (const n of w.kids.get(w.branches[0]!)!) master(db, player.id, n, day(10));
    for (const n of w.kids.get(w.branches[1]!)!.slice(0, 6)) master(db, player.id, n, day(10));
    expect(loadPlayerState(db, player.id).total).toBe(11);
    const offer = maybeCreateOffer(db, player.id)!;
    revealPending(db, player.id, day(11));
    const options = parseOptions(offer);
    acceptOffer(db, player.id, offer.id, options[0]!.classId, { now: day(11) });
    return { db, w, player, offer, options };
  };

  it("needs a class to respec", () => {
    const db = makeDb();
    seedWorld(db);
    const player = makePlayer(db);
    const item = give(db, player.id, "respec_token");
    expect(useItem(db, player.id, item.id)).toEqual({ ok: false, error: "no-class" });
  });

  it("refuses at an unchanged level, then re-offers once the level has moved", () => {
    const { db, w, player, offer } = classed();
    const token = give(db, player.id, "respec_token");
    // The offer was cut at level 11 and total is still 11: nothing has moved.
    expect(offer.gateLevel).toBe(10);
    expect(useItem(db, player.id, token.id)).toMatchObject({ ok: true, kind: "respec_token" });
    const rows = db.select().from(schema.atlasClassOffers).all();
    expect(rows.map((r) => [r.gateLevel, r.status])).toEqual([
      [10, "expired"],
      [11, "queued"],
    ]);
    expect(currentClass(db, player.id)).toBeNull();
    expect(itemRow(db, token.id).status).toBe("consumed");
    expect(verbs(db, player.id, "use_item")).toHaveLength(1);

    // An undecided offer blocks a second token.
    const t2 = give(db, player.id, "respec_token");
    expect(useItem(db, player.id, t2.id)).toEqual({ ok: false, error: "offer-pending" });

    // Decide it; the same level now refuses a second respec.
    const fresh = rows[1]!;
    revealPending(db, player.id, day(12));
    expect(acceptOffer(db, player.id, fresh.id, parseOptions(fresh)[1]!.classId).ok).toBe(true);
    expect(useItem(db, player.id, t2.id)).toEqual({ ok: false, error: "level-unchanged" });
    expect(itemRow(db, t2.id).status).toBe("owned");

    // Level up (language 2100 -> 2800 XP is level 8): a respec is allowed again.
    for (const n of w.kids.get(w.branches[1]!)!.slice(6, 13)) master(db, player.id, n, day(13));
    expect(loadPlayerState(db, player.id).total).toBeGreaterThan(11);
    expect(useItem(db, player.id, t2.id)).toMatchObject({ ok: true });
    expect(currentClass(db, player.id)).toBeNull();
  });
});

describe("cosmetics and loadout", () => {
  it("cosmetic kinds are equipped, not used", () => {
    const db = makeDb();
    seedWorld(db);
    const player = makePlayer(db);
    const frame = give(db, player.id, "frame", "frame-oak");
    expect(useItem(db, player.id, frame.id)).toEqual({ ok: false, error: "not-usable" });
  });

  it("equips owned cosmetics and base parts only, merging patches and logging equip", () => {
    const db = makeDb();
    seedWorld(db);
    const player = makePlayer(db);
    give(db, player.id, "frame", "frame-oak");
    give(db, player.id, "sprite_part", "cape-scholar");

    expect(equipLoadout(db, player.id, { frame: "frame-brass" })).toMatchObject({ ok: false });
    expect(equipLoadout(db, player.id, { sprite: { cape: "hair-laurel" } })).toMatchObject({ ok: false });
    // A frame ref does not satisfy a map-style slot.
    expect(equipLoadout(db, player.id, { mapStyle: "frame-oak" })).toMatchObject({ ok: false });

    const one = equipLoadout(db, player.id, {
      frame: "frame-oak",
      sprite: { cape: "cape-scholar", hair: "hair-short" },
    });
    expect(one).toEqual({
      ok: true,
      loadout: { frame: "frame-oak", sprite: { cape: "cape-scholar", hair: "hair-short" } },
    });
    const two = equipLoadout(db, player.id, { sprite: { cape: null } });
    expect(two).toEqual({ ok: true, loadout: { frame: "frame-oak", sprite: { hair: "hair-short" } } });
    const stored = db.select().from(schema.atlasPlayers).get()!;
    expect(parseLoadout(stored.loadout)).toEqual({ frame: "frame-oak", sprite: { hair: "hair-short" } });
    expect(verbs(db, player.id, "equip")).toHaveLength(2);
  });
});
