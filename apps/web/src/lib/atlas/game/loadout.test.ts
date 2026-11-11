import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "../../../db/schema";
import { meGamePayload } from "../progress";
import { LOOT } from "./loot";
import { RENDERED_SPRITE_STYLE } from "../spriteStyle";
import { LoadoutPatchSchema, SPRITE_SLOTS, equipLoadout, lookToLoadout, manifestPath, spriteRules } from "./loadout";
import { useItem } from "./items";
import { makeDb, makePlayer, seedWorld } from "./testkit";

type ManifestJson = {
  slots: Array<{ id: string }>;
  parts: Array<{ id: string; slot: string; grantedBy: string | null }>;
  swapGroups: Record<string, { tones: Record<string, string[]> }>;
  cosmetics: { frames: string[]; mapStyles: string[] };
};
const readManifest = (style: string): ManifestJson =>
  JSON.parse(
    fs.readFileSync(
      path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        `../../../../public/sprite/${style}/manifest.json`,
      ),
      "utf8",
    ),
  ) as ManifestJson;
const manifest = readManifest(RENDERED_SPRITE_STYLE);
// Frames and map styles are not sprite parts; their ids live in the classic manifest.
const classic = readManifest("classic");

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

describe("loadout rules come from the rendered sprite manifest", () => {
  it("reads the rendered style's manifest", () => {
    expect(manifestPath(RENDERED_SPRITE_STYLE)).toMatch(/public\/sprite\/atlas\/manifest\.json$/);
    expect(spriteRules()).toBe(spriteRules()); // parsed once, cached
  });

  it("slots, part->slot, base parts and swap groups agree with manifest.json", () => {
    const rules = spriteRules();
    expect([...SPRITE_SLOTS]).toEqual(manifest.slots.map((s) => s.id));
    expect(rules.partSlots).toEqual(Object.fromEntries(manifest.parts.map((p) => [p.id, p.slot])));
    expect([...rules.baseParts].sort()).toEqual(
      manifest.parts.filter((p) => p.grantedBy === null).map((p) => p.id).sort(),
    );
    expect(rules.swapGroups).toEqual(
      Object.fromEntries(Object.entries(manifest.swapGroups).map(([g, d]) => [g, Object.keys(d.tones)])),
    );
  });

  it("every loot sprite part exists in the rendered manifest as a loot part, and vice versa", () => {
    const lootParts = LOOT.cosmetics.filter((c) => c.kind === "sprite_part").map((c) => c.ref);
    for (const ref of lootParts) {
      const part = manifest.parts.find((p) => p.id === ref);
      expect(part, `loot part ${ref} is missing from the ${RENDERED_SPRITE_STYLE} manifest`).toBeDefined();
      expect(part!.grantedBy).toBe("loot");
    }
    expect([...lootParts].sort()).toEqual(
      manifest.parts.filter((p) => p.grantedBy === "loot").map((p) => p.id).sort(),
    );
  });

  it("frame and map-style loot match the cosmetics list", () => {
    const of = (kind: string) => LOOT.cosmetics.filter((c) => c.kind === kind).map((c) => c.ref).sort();
    expect(of("frame")).toEqual([...classic.cosmetics.frames].sort());
    expect(of("map_style")).toEqual([...classic.cosmetics.mapStyles].sort());
  });
});

describe("LoadoutPatchSchema", () => {
  it("accepts explicit nulls to clear frame, mapStyle, sprite slots and tones", () => {
    expect(LoadoutPatchSchema.safeParse({ frame: null, mapStyle: null, sprite: { cape: null, hair: "hair-bob" } }).success).toBe(true);
    expect(LoadoutPatchSchema.safeParse({ tones: null }).success).toBe(true);
    expect(LoadoutPatchSchema.safeParse({ tones: { skin: "tan", hair: null } }).success).toBe(true);
  });
  it("rejects unknown slots and unknown keys", () => {
    expect(LoadoutPatchSchema.safeParse({ sprite: { wings: "hair-bob" } }).success).toBe(false);
    expect(LoadoutPatchSchema.safeParse({ colors: {} }).success).toBe(false);
    expect(LoadoutPatchSchema.safeParse({ tones: { skin: "Not An Id" } }).success).toBe(false);
  });
});

describe("lookToLoadout", () => {
  it("builds a loadout from base parts and tones", () => {
    expect(
      lookToLoadout({ sprite: { body: "body-girl", hair: "hair-pigtails" }, tones: { skin: "deep", hair: "red" } }),
    ).toEqual({
      ok: true,
      loadout: { sprite: { body: "body-girl", hair: "hair-pigtails" }, tones: { skin: "deep", hair: "red" } },
    });
    expect(lookToLoadout({})).toEqual({ ok: true, loadout: { sprite: {} } });
  });
  it("rejects loot parts, wrong slots, unknown parts, groups and tones", () => {
    expect(lookToLoadout({ sprite: { hair: "hair-hood" } })).toMatchObject({ ok: false });
    expect(lookToLoadout({ sprite: { outfit: "hair-bob" } })).toMatchObject({ ok: false });
    expect(lookToLoadout({ sprite: { hair: "hair-short" } })).toMatchObject({ ok: false });
    expect(lookToLoadout({ tones: { eyes: "blue" } })).toMatchObject({ ok: false });
    expect(lookToLoadout({ tones: { skin: "green" } })).toMatchObject({ ok: false });
  });
});

describe("equipLoadout", () => {
  it("rejects a part in the wrong slot, even an owned one", () => {
    const db = makeDb();
    const p = makePlayer(db);
    chestItem(db, p.id, "sprite_part", "hair-hood", true);
    expect(equipLoadout(db, p.id, { sprite: { outfit: "hair-hood" } })).toMatchObject({ ok: false });
    expect(equipLoadout(db, p.id, { sprite: { hair: "hair-hood" } })).toMatchObject({ ok: true });
    expect(equipLoadout(db, p.id, { sprite: { hair: null }, frame: null, mapStyle: null })).toEqual({
      ok: true,
      loadout: { sprite: {} },
    });
  });

  it("equips an atlas base part with tones, merges and clears tones", () => {
    const db = makeDb();
    const p = makePlayer(db);
    expect(
      equipLoadout(db, p.id, { sprite: { body: "body-girl", hair: "hair-curly" }, tones: { skin: "tan", hair: "gold" } }),
    ).toEqual({
      ok: true,
      loadout: { sprite: { body: "body-girl", hair: "hair-curly" }, tones: { skin: "tan", hair: "gold" } },
    });
    expect(equipLoadout(db, p.id, { tones: { hair: null, skin: "fair" } })).toEqual({
      ok: true,
      loadout: { sprite: { body: "body-girl", hair: "hair-curly" }, tones: { skin: "fair" } },
    });
    expect(equipLoadout(db, p.id, { tones: null })).toEqual({
      ok: true,
      loadout: { sprite: { body: "body-girl", hair: "hair-curly" } },
    });
  });

  it("rejects an unknown part, swap group or tone and stores nothing", () => {
    const db = makeDb();
    const p = makePlayer(db);
    expect(equipLoadout(db, p.id, { sprite: { hair: "hair-short" } })).toMatchObject({ ok: false });
    expect(equipLoadout(db, p.id, { tones: { eyes: "blue" } })).toMatchObject({ ok: false });
    expect(equipLoadout(db, p.id, { tones: { skin: "green" } })).toMatchObject({ ok: false });
    expect(equipLoadout(db, p.id, { sprite: { hair: "hair-bob" }, tones: { hair: "teal" } })).toMatchObject({ ok: false });
    expect(db.select().from(schema.atlasPlayers).where(eq(schema.atlasPlayers.id, p.id)).get()!.loadout).toBeNull();
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
