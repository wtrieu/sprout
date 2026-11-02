/**
 * Loot — every achievement carries a box, and the box is a pure function of
 * `playerId:slug`: the same grant always rolls the same loot, so tests are
 * exact and a retried grant can never reroll for something better.
 *
 * The cosmetic ids below are the contract with the sprite manifest (built in
 * parallel in the atlas-sprites repo); change one here and the manifest's
 * `grantedBy` must follow. Item kinds are data like event verbs — nothing
 * outside this file and items.ts needs to know what a kind does.
 */

export type LootDrop = { kind: string; ref: string | null };

/** The one tuning block: cosmetic pools, functional kinds and their odds. */
export const LOOT = {
  cosmetics: [
    { kind: "frame", ref: "frame-oak" },
    { kind: "frame", ref: "frame-brass" },
    { kind: "frame", ref: "frame-ivy" },
    { kind: "frame", ref: "frame-stellar" },
    { kind: "map_style", ref: "style-parchment" },
    { kind: "map_style", ref: "style-night" },
    { kind: "map_style", ref: "style-botanical" },
    { kind: "sprite_part", ref: "cape-scholar" },
    { kind: "sprite_part", ref: "item-lantern" },
    { kind: "sprite_part", ref: "hair-laurel" },
    { kind: "sprite_part", ref: "aura-spark" },
  ],
  /** Weights are relative: respec 2, fog reveal 2, rare key 1. */
  functional: [
    { kind: "respec_token", weight: 2 },
    { kind: "fog_reveal", weight: 2 },
    { kind: "rare_node_key", weight: 1 },
  ],
  /** Chance an ordinary achievement adds a functional item. Hidden: always. */
  functionalChance: 0.25,
} as const;

export const FUNCTIONAL_KINDS: readonly string[] = LOOT.functional.map((f) => f.kind);

/** FNV-1a: small, stable, dependency-free. */
const hash32 = (text: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
};

/** mulberry32: a seeded float generator in [0, 1). */
export const seededRng = (seed: string): (() => number) => {
  let a = hash32(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const lootSeed = (playerId: number, slug: string): string => `${playerId}:${slug}`;

/**
 * Roll one achievement's box: a cosmetic the player does not own (pool
 * exhausted → a respec token instead), plus a functional item at 25% — or
 * always, for a hidden achievement. The rng is consumed in a fixed order so
 * adding a cosmetic to the pool is the only thing that shifts old rolls.
 */
export const rollLoot = (
  seed: string,
  ownedRefs: Iterable<string>,
  opts: { hidden?: boolean } = {},
): LootDrop[] => {
  const rng = seededRng(seed);
  const owned = new Set(ownedRefs);
  const free = LOOT.cosmetics.filter((c) => !owned.has(c.ref));
  const drops: LootDrop[] = [];
  const pick = rng();
  const chance = rng();
  const weighted = rng();
  if (free.length > 0) {
    const c = free[Math.floor(pick * free.length)]!;
    drops.push({ kind: c.kind, ref: c.ref });
  } else {
    drops.push({ kind: "respec_token", ref: null });
  }
  if (opts.hidden || chance < LOOT.functionalChance) {
    const total = LOOT.functional.reduce((sum, f) => sum + f.weight, 0);
    let at = weighted * total;
    for (const f of LOOT.functional) {
      if (at < f.weight) {
        drops.push({ kind: f.kind, ref: null });
        break;
      }
      at -= f.weight;
    }
  }
  return drops;
};
