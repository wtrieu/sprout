import type { Tier } from "../hooks/quality";
import type { ParticleMaterialOptions } from "../materials/particleMaterial";

/**
 * The scene script: what painted layers and particle weather each beat is
 * made of. `chapterConfig.ts` stays the camera + color script; this file is
 * the paper theater — every visual in the journey is either a painted plane
 * declared here or a particle recipe declared here.
 *
 * Every asset is OPTIONAL at runtime. A missing file silently skips that
 * layer (the procedural sky/hills in SceneAtmosphere remain), so art drops
 * are pure file-copies into public/landing/scenes/<dir>/ with no code
 * change. See docs/landing-art-pipeline.md for the generation pipeline.
 */

export type LayerMotion =
  /** oscillating UV drift — clouds, mist, bokeh; works on any art */
  | { type: "drift"; amp: [number, number]; speed: number }
  /** continuous UV scroll — art must tile along `dir` (flagged in its brief) */
  | { type: "scroll"; dir: [number, number]; speed: number }
  /** vertex sway weighted by uv.y² — foliage; base anchored, tips move */
  | { type: "sway"; amp: number; freq: number };

export type BeatLayer = {
  /** file id → /landing/scenes/<dir>/<id>.webp (+ .webm/.mp4 when video) */
  id: string;
  kind: "sky" | "card";
  /** folder override when a beat borrows another beat's art (cta → night) */
  dir?: string;
  /** pre-migration fallback URL, tried when the scenes/ file is missing */
  legacySrc?: string;
  /** card only: distance from the beat camera along its view axis */
  distance?: number;
  /** card only: [right, up] offset in beat-camera space */
  offset?: [number, number];
  /** frustum-height coverage at `distance`; ≥1.3 full-bleed, <1 for props */
  coverage?: number;
  /** alpha-cutout painting (straight-alpha WebP) vs full-bleed */
  cutout?: boolean;
  /** base opacity multiplier on top of the beat fade */
  opacity?: number;
  motion?: LayerMotion;
  /** a video loop exists for this layer; the .webp still is its poster */
  video?: boolean;
  /** additive blending — god-ray washes, glow layers */
  additive?: boolean;
  /** minimum device tier that renders this layer (default: everyone) */
  minTier?: Tier;
};

/** One ParticleField, declaratively: material options + placement + fades. */
export type ParticleRecipe = ParticleMaterialOptions & {
  id: string;
  count: number;
  center?: [number, number, number];
  box?: [number, number, number];
  /** explicit positions builder (constellations etc.) — count is ignored */
  positions?: () => Float32Array;
  /** stagger-scale particles in with this beat's local progress */
  growBeat?: number;
  /** per-frame opacity from global progress (chapter fades) */
  opacityFn?: (progress: number) => number;
  /** beats of distance from this beat at which the field is culled */
  span?: number;
};

export type BeatScene = {
  /** must match BEATS[i].id in chapterConfig */
  beatId: string;
  /** asset folder under public/landing/scenes/ */
  dir: string;
  /** painted planes, back to front */
  layers: BeatLayer[];
  particles: ParticleRecipe[];
  /** which side the copy occupies — the art keeps that side quiet */
  textSafe: "left" | "right" | "center";
};

/** Candidate URLs for a layer's still, in load-preference order. */
export function layerSources(scene: BeatScene, layer: BeatLayer): string[] {
  const urls = [`/landing/scenes/${layer.dir ?? scene.dir}/${layer.id}.webp`];
  if (layer.legacySrc) urls.push(layer.legacySrc);
  return urls;
}

export const SCENES: BeatScene[] = [
  {
    // Hero — a wish adrift in the twilight underground
    beatId: "hero",
    dir: "hero",
    textSafe: "center",
    layers: [
      { id: "sky", kind: "sky", legacySrc: "/landing/backdrops/hero.webp" },
    ],
    particles: [],
  },
  {
    // Ch 1 — rooted at home, amber light through dark soil
    beatId: "roots",
    dir: "roots",
    textSafe: "left",
    layers: [
      { id: "sky", kind: "sky", legacySrc: "/landing/backdrops/roots.webp" },
    ],
    particles: [],
  },
  {
    // Ch 2 — first rain: storm-light over hazed hills
    beatId: "rain",
    dir: "rain",
    textSafe: "right",
    layers: [
      { id: "sky", kind: "sky", legacySrc: "/landing/backdrops/rain.webp" },
    ],
    particles: [],
  },
  {
    // Ch 3 — the sprout breaks through into a violet-amber dawn
    beatId: "sprout",
    dir: "dawn",
    textSafe: "left",
    layers: [
      { id: "sky", kind: "sky", legacySrc: "/landing/backdrops/dawn.webp" },
    ],
    particles: [],
  },
  {
    // Ch 4 — a fairy-tale meadow under the blue anime noon (style anchor)
    beatId: "sapling",
    dir: "noon",
    textSafe: "right",
    layers: [
      { id: "sky", kind: "sky", legacySrc: "/landing/backdrops/noon.webp" },
    ],
    particles: [],
  },
  {
    // Ch 5 — in bloom at violet golden hour
    beatId: "bloom",
    dir: "golden",
    textSafe: "left",
    layers: [
      { id: "sky", kind: "sky", legacySrc: "/landing/backdrops/golden.webp" },
    ],
    particles: [],
  },
  {
    // Ch 6 — under the canopy: moonlit indigo, lanterns
    beatId: "night",
    dir: "night",
    textSafe: "center",
    layers: [
      { id: "sky", kind: "sky", legacySrc: "/landing/backdrops/night.webp" },
    ],
    particles: [],
  },
  {
    // Finale — the ❋ glows among the branches (borrows the night sky)
    beatId: "cta",
    dir: "cta",
    textSafe: "center",
    layers: [
      { id: "sky", kind: "sky", dir: "night", legacySrc: "/landing/backdrops/night.webp" },
    ],
    particles: [],
  },
];
