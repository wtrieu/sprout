import { describe, expect, it } from "vitest";
import * as schema from "../../../db/schema";
import { eventsForPlayer } from "../events";
import {
  LEVEL_ACK_VERB,
  acknowledgeLevelUp,
  levelWatermark,
  pendingFor,
  revealPending,
} from "./pending";
import { makeDb, makePlayer, master, open, seedWorld } from "./testkit";

const acks = (db: ReturnType<typeof makeDb>, playerId: number) =>
  eventsForPlayer(db, playerId).filter((e) => e.verb === LEVEL_ACK_VERB);

describe("pending level-ups", () => {
  it("a brand-new character has no level-up on the first map visit", () => {
    const db = makeDb();
    seedWorld(db);
    const player = makePlayer(db);
    expect(pendingFor(db, player.id).levelUp).toBeNull();
  });

  it("opening a node alone earns no level, so nothing is pending", () => {
    const db = makeDb();
    const w = seedWorld(db);
    const player = makePlayer(db);
    open(db, player.id, w.all[0]!);
    expect(pendingFor(db, player.id).levelUp).toBeNull();
  });

  it("appears once, is acknowledged, and does not reappear", () => {
    const db = makeDb();
    const w = seedWorld(db);
    const player = makePlayer(db);
    const branch = w.branches[0]!;
    master(db, player.id, w.kids.get(branch)![0]!);

    const up = pendingFor(db, player.id).levelUp;
    expect(up).not.toBeNull();
    expect(up!.kind).toBe("level_up");
    expect(up!.total.to).toBeGreaterThan(up!.total.from);
    expect(up!.total.from).toBe(5);
    expect(up!.branches).toEqual([
      expect.objectContaining({ nodeId: branch, mapId: w.mapId, title: "Branch 1", from: 1 }),
    ]);
    expect(up!.disciplines.length).toBe(1);
    expect(up!.disciplines[0]).toMatchObject({ from: 1, to: 2 });
    // Reading it again changes nothing: pending is a read.
    expect(pendingFor(db, player.id).levelUp).toEqual(up);

    const acked = acknowledgeLevelUp(db, player.id, up!.throughEventId);
    expect(acked).toEqual(up);
    expect(pendingFor(db, player.id).levelUp).toBeNull();
    // A second ack is a no-op: no second event.
    expect(acknowledgeLevelUp(db, player.id, up!.throughEventId)).toBeNull();
    expect(acks(db, player.id)).toHaveLength(1);
  });

  it("reports only what rose since the last ack, from the acknowledged level", () => {
    const db = makeDb();
    const w = seedWorld(db);
    const player = makePlayer(db);
    const [b1, b2] = w.branches as [number, number];
    master(db, player.id, w.kids.get(b1)![0]!);
    const first = pendingFor(db, player.id).levelUp!;
    acknowledgeLevelUp(db, player.id, first.throughEventId);

    master(db, player.id, w.kids.get(b2)![0]!);
    const second = pendingFor(db, player.id).levelUp!;
    expect(second.total.from).toBe(first.total.to);
    expect(second.branches.map((b) => b.nodeId)).toEqual([b2]);
  });

  it("an ack never swallows a level earned after the modal opened", () => {
    const db = makeDb();
    const w = seedWorld(db);
    const player = makePlayer(db);
    const [b1, b2] = w.branches as [number, number];
    master(db, player.id, w.kids.get(b1)![0]!);
    const shown = pendingFor(db, player.id).levelUp!;
    // Earned while the modal was up, before the ack arrives.
    master(db, player.id, w.kids.get(b2)![0]!);
    acknowledgeLevelUp(db, player.id, shown.throughEventId);

    const left = pendingFor(db, player.id).levelUp!;
    expect(left.branches.map((b) => b.nodeId)).toEqual([b2]);
  });

  it("clamps an ack to the player's own log: future levels can't be pre-acknowledged", () => {
    const db = makeDb();
    const w = seedWorld(db);
    const player = makePlayer(db);
    master(db, player.id, w.all[0]!);
    acknowledgeLevelUp(db, player.id, 1_000_000);
    expect(levelWatermark(eventsForPlayer(db, player.id))).toBeLessThan(1_000_000);
    master(db, player.id, w.all[6]!);
    expect(pendingFor(db, player.id).levelUp).not.toBeNull();
  });

  it("a node added to a branch later is not a level change and never a drop", () => {
    const db = makeDb();
    const w = seedWorld(db, 1, 2);
    const player = makePlayer(db);
    const branch = w.branches[0]!;
    master(db, player.id, w.kids.get(branch)![0]!);
    acknowledgeLevelUp(db, player.id, pendingFor(db, player.id).levelUp!.throughEventId);
    db.insert(schema.atlasNodes)
      .values({
        mapId: w.mapId,
        parentId: branch,
        position: 9,
        title: "Late",
        blurb: "k",
        kind: "school",
        discipline: "evidence",
      })
      .run();
    expect(pendingFor(db, player.id).levelUp).toBeNull();
  });

  it("levels are per player: one character's level-up is not another's", () => {
    const db = makeDb();
    const w = seedWorld(db);
    const a = makePlayer(db, "a@x.y");
    const b = makePlayer(db, "b@x.y");
    master(db, a.id, w.all[0]!);
    expect(pendingFor(db, a.id).levelUp).not.toBeNull();
    expect(pendingFor(db, b.id).levelUp).toBeNull();
  });

  it("opening the chest does not acknowledge a level-up unless the caller showed it", () => {
    const db = makeDb();
    const w = seedWorld(db);
    const player = makePlayer(db);
    master(db, player.id, w.all[0]!);
    const up = pendingFor(db, player.id).levelUp!;

    // Today's modal: POST /reveals with no level-up step rendered.
    const plain = revealPending(db, player.id);
    expect(plain.levelUp).toEqual(up);
    expect(pendingFor(db, player.id).levelUp).toEqual(up);

    // A modal that showed it passes the watermark back.
    revealPending(db, player.id, new Date(), { levelUpThrough: up.throughEventId });
    expect(pendingFor(db, player.id).levelUp).toBeNull();
    expect(acks(db, player.id)).toHaveLength(1);
  });
});
