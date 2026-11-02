import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "../../../db/schema";
import { meGamePayload } from "../progress";
import { LOOT } from "./loot";
import { BASE_LOADOUT, LoadoutPatchSchema, PART_SLOTS, SPRITE_SLOTS, equipLoadout } from "./loadout";
import { useItem } from "./items";
import { makeDb, makePlayer, seedWorld } from "./testkit";

const manifest = JSON.parse(
  fs.readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../../public/sprite/classic/manifest.json",
    ),
    "utf8",
  ),
) as {
  slots: Array<{ id: string }>;
  parts: Array<{ id: string; slot: string; grantedBy: string | null }>;
  cosmetics: { frames: string[]; mapStyles: string[] };
};

/** An item from a chest; revealed or not. */
const chestItem = (db: ReturnType<typeof makeDb>, playerId: number, kind: string, ref: string | null, revealed: boolean) => {
  const a = db
    .insert(schema.atlasAchievements)
    .values({
      playerId,
      slug: `chest-${kind}-${ref}`,
      title: "t",
      flavor: "f",
      source: "base",
      revealedAt: revealed ? new Date() : null,
    })
    .returning()
    .get();
  return db
    .insert(schema.atlasItems)
    .values({ playerId, achievementId: a.id, kind, ref })
    .returning()
    .get();
};

describe("loadout constants match the sprite manifest", () => {
  it("slots, part->slot, base parts and cosmetics agree with manifest.json", () => {
    expect([...SPRITE_SLOTS]).toEqual(manifest.slots.map((s) => s.id));
    expect(PART_SLOTS).toEqual(Object.fromEntries(manifest.parts.map((p) => [p.id, p.slot])));
    expect([...BASE_LOADOUT].sort()).toEqual(
      manifest.parts.filter((p) => p.grantedBy === null).map((p) => p.id).sort(),
    );
    const loot = LOOT.cosmetics.map((c) => c.ref).sort();
    const known = [
      ...manifest.cosmetics.frames,
      ...manifest.cosmetics.mapStyles,
      ...manifest.parts.filter((p) => p.grantedBy !== null).map((p) => p.id),
    ].sort();
    expect(loot).toEqual(known);
  });
});

describe("LoadoutPatchSchema", () => {
  it("accepts explicit nulls to clear frame, mapStyle and sprite slots", () => {
    expect(LoadoutPatchSchema.safeParse({ frame: null, mapStyle: null, sprite: { cape: null, hair: "hair-short" } }).success).toBe(true);
  });
  it("rejects unknown slots", () => {
    expect(LoadoutPatchSchema.safeParse({ sprite: { wings: "hair-short" } }).success).toBe(false);
  });
});

describe("equipLoadout", () => {
  it("rejects a part in the wrong slot, even an owned one", () => {
    const db = makeDb();
    const p = makePlayer(db);
    chestItem(db, p.id, "sprite_part", "cape-scholar", true);
    expect(equipLoadout(db, p.id, { sprite: { hair: "cape-scholar" } })).toMatchObject({ ok: false });
    expect(equipLoadout(db, p.id, { sprite: { cape: "cape-scholar" } })).toMatchObject({ ok: true });
    expect(equipLoadout(db, p.id, { sprite: { cape: null }, frame: null, mapStyle: null })).toEqual({
      ok: true,
      loadout: { sprite: {} },
    });
  });

  it("cannot equip loot from an unopened chest, until it is revealed", () => {
    const db = makeDb();
    const p = makePlayer(db);
    const item = chestItem(db, p.id, "frame", "frame-oak", false);
    expect(equipLoadout(db, p.id, { frame: "frame-oak" })).toMatchObject({ ok: false });
    db.update(schema.atlasAchievements)
      .set({ revealedAt: new Date() })
      .where(eq(schema.atlasAchievements.id, item.achievementId!))
      .run();
    expect(equipLoadout(db, p.id, { frame: "frame-oak" })).toMatchObject({ ok: true });
  });
});

describe("unrevealed loot", () => {
  it("is hidden from the me payload and cannot be used until the chest opens", () => {
    const db = makeDb();
    seedWorld(db);
    const p = makePlayer(db);
    const hidden = chestItem(db, p.id, "fog_reveal", null, false);
    const free = db.insert(schema.atlasItems).values({ playerId: p.id, kind: "frame", ref: "frame-ivy" }).returning().get();

    const ids = () => meGamePayload(db, p).items.map((i) => i.id);
    expect(ids()).toEqual([free.id]);
    expect(useItem(db, p.id, hidden.id)).toEqual({ ok: false, error: "not-found" });
    expect(db.select().from(schema.atlasItems).where(eq(schema.atlasItems.id, hidden.id)).get()!.status).toBe("owned");

    db.update(schema.atlasAchievements)
      .set({ revealedAt: new Date() })
      .where(eq(schema.atlasAchievements.id, hidden.achievementId!))
      .run();
    expect(ids()).toEqual([hidden.id, free.id]);
    // Revealed now; it fails on game state (a one-branch... nothing hidden), not on visibility.
    expect(useItem(db, p.id, hidden.id)).not.toEqual({ ok: false, error: "not-found" });
  });
});
