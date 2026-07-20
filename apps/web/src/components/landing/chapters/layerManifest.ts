import * as THREE from "three";
import type { Tier } from "../hooks/quality";
import type { ParticleMaterialOptions } from "../materials/particleMaterial";
import { SEGMENTS } from "./chapterConfig";
import { makeGlyphPositions } from "./glyphPositions";

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
    particles: [
      {
        // pastel bokeh — big soft out-of-focus lights, the KyoAni opening frame
        id: "bokeh",
        count: 70,
        center: [0, -13.6, 1],
        box: [20, 10, 9],
        color: "#f0abfc",
        color2: "#fde68a",
        size: 30,
        opacity: 0.16,
        additive: true,
        twinkle: 0.35,
        driftAmp: [0.5, 0.4, 0.3],
        driftFreq: 0.12,
        fadeFar: 26,
        span: 2.1,
        opacityFn: (p) => 1 - THREE.MathUtils.smoothstep(p * SEGMENTS, 1.1, 1.9),
      },
      {
        // spore-lights drifting up like slow embers of a wish
        id: "spores",
        count: 420,
        center: [0, -13.8, 0],
        box: [16, 9, 10],
        color: "#a5f3fc",
        color2: "#f0abfc",
        size: 3,
        opacity: 0.7,
        additive: true,
        twinkle: 0.55,
        fallSpeed: -0.32,
        wrapY: [-18.5, -9.5],
        driftAmp: [0.35, 0.2, 0.3],
        driftFreq: 0.3,
        fadeFar: 22,
        span: 2.1,
        opacityFn: (p) => 1 - THREE.MathUtils.smoothstep(p * SEGMENTS, 1.1, 1.9),
      },
      {
        // a few grander motes of gold dust
        id: "gold-dust",
        count: 130,
        center: [0, -14, 2],
        box: [14, 8, 8],
        color: "#fde68a",
        color2: "#fff7e0",
        size: 5,
        opacity: 0.5,
        additive: true,
        twinkle: 0.75,
        driftAmp: [0.3, 0.25, 0.25],
        driftFreq: 0.2,
        fadeFar: 22,
        span: 2.1,
        opacityFn: (p) => 1 - THREE.MathUtils.smoothstep(p * SEGMENTS, 1.2, 2.0),
      },
    ],
  },
  {
    // Ch 1 — rooted at home, amber light through dark soil
    beatId: "roots",
    dir: "roots",
    textSafe: "left",
    layers: [
      { id: "sky", kind: "sky", legacySrc: "/landing/backdrops/roots.webp" },
    ],
    particles: [
      {
        // warm embers wandering the root glow
        id: "embers",
        count: 340,
        center: [0, -8.5, 0],
        box: [13, 13, 10],
        color: "#ffd9a0",
        color2: "#b46ad4",
        size: 2.4,
        opacity: 0.5,
        additive: true,
        twinkle: 0.6,
        driftAmp: [0.3, 0.35, 0.25],
        driftFreq: 0.3,
        fadeFar: 22,
        span: 1.8,
      },
    ],
  },
  {
    // Ch 2 — first rain: storm-light over hazed hills
    beatId: "rain",
    dir: "rain",
    textSafe: "right",
    layers: [
      { id: "sky", kind: "sky", legacySrc: "/landing/backdrops/rain.webp" },
    ],
    particles: [
      {
        id: "rain",
        count: 2600,
        center: [0, 6.5, -1],
        box: [34, 15, 22],
        color: "#9fd6f2",
        color2: "#5b93b8",
        size: 7,
        opacity: 0.42,
        shape: "streak",
        fallSpeed: 7.5,
        wrapY: [-0.6, 14],
        driftAmp: [0.06, 0, 0.04],
        driftFreq: 0.8,
        velocityDrag: 0.012,
        fadeFar: 34,
        span: 1.8,
      },
      {
        // a few glowing "citation" drops — the careful sources landing home
        id: "citation-drops",
        count: 46,
        center: [0, 6, 0],
        box: [20, 13, 12],
        color: "#bae6fd",
        color2: "#7dd3fc",
        size: 5.5,
        opacity: 0.85,
        additive: true,
        fallSpeed: 1.6,
        wrapY: [-0.4, 12.5],
        twinkle: 0.5,
        driftAmp: [0.12, 0, 0.1],
        fadeFar: 34,
        span: 1.8,
      },
      {
        // wet-ground sheen where the rain lands
        id: "sheen",
        count: 280,
        center: [0, 0.25, 1],
        box: [26, 0.4, 16],
        color: "#7dd3fc",
        color2: "#294b63",
        size: 2.2,
        opacity: 0.4,
        additive: true,
        twinkle: 0.75,
        driftAmp: [0.05, 0.02, 0.05],
        fadeFar: 30,
        span: 1.8,
        opacityFn: (p) => {
          const x = p * SEGMENTS;
          return (
            THREE.MathUtils.smoothstep(x, 1.3, 2.0) * (1 - THREE.MathUtils.smoothstep(x, 2.6, 3.2))
          );
        },
      },
    ],
  },
  {
    // Ch 3 — the sprout breaks through into a violet-amber dawn
    beatId: "sprout",
    dir: "dawn",
    textSafe: "left",
    layers: [
      { id: "sky", kind: "sky", legacySrc: "/landing/backdrops/dawn.webp" },
    ],
    particles: [
      {
        // dawn dust hanging in the first light
        id: "dawn-dust",
        count: 500,
        center: [1, 2.5, -0.5],
        box: [10, 7, 8],
        color: "#fcd34d",
        color2: "#a16207",
        size: 2.2,
        opacity: 0.5,
        additive: true,
        twinkle: 0.45,
        driftAmp: [0.3, 0.2, 0.25],
        driftFreq: 0.4,
        growBeat: 3,
        fadeFar: 26,
        span: 1.8,
      },
    ],
  },
  {
    // Ch 4 — a fairy-tale meadow under the blue anime noon (style anchor)
    beatId: "sapling",
    dir: "noon",
    textSafe: "right",
    layers: [
      { id: "sky", kind: "sky", legacySrc: "/landing/backdrops/noon.webp" },
    ],
    particles: [
      {
        // pollen drifting in the sun shafts
        id: "pollen",
        count: 900,
        center: [0, 4.5, 0],
        box: [16, 9, 11],
        color: "#fde68a",
        color2: "#c8ecd2",
        size: 2,
        opacity: 0.5,
        additive: true,
        twinkle: 0.5,
        driftAmp: [0.45, 0.3, 0.4],
        driftFreq: 0.35,
        growBeat: 4,
        fadeFar: 34,
        span: 1.8,
      },
      {
        // dandelion seeds riding the thermals — up and away
        id: "dandelion",
        count: 140,
        center: [2, 4, 2],
        box: [18, 8, 10],
        color: "#ffffff",
        color2: "#f0ead8",
        size: 3.4,
        opacity: 0.8,
        fallSpeed: -0.5,
        wrapY: [0.5, 9],
        driftAmp: [0.9, 0.2, 0.5],
        driftFreq: 0.5,
        growBeat: 4,
        fadeFar: 30,
        span: 1.8,
      },
    ],
  },
  {
    // Ch 5 — in bloom at violet golden hour
    beatId: "bloom",
    dir: "golden",
    textSafe: "left",
    layers: [
      { id: "sky", kind: "sky", legacySrc: "/landing/backdrops/golden.webp" },
    ],
    particles: [
      {
        // petals letting go, drifting down through the light
        id: "petals",
        count: 650,
        center: [0, 7.5, 1],
        box: [13, 8, 10],
        color: "#fda4af",
        color2: "#fb7185",
        size: 4.2,
        opacity: 0.75,
        shape: "petal",
        fallSpeed: 0.55,
        wrapY: [3.5, 11.5],
        driftAmp: [0.6, 0.1, 0.5],
        driftFreq: 0.5,
        growBeat: 5,
        fadeFar: 30,
        span: 1.8,
      },
      {
        // a few petals flash like tiny glowing pages — the journal remembering
        id: "pages",
        count: 40,
        center: [0, 9, 1],
        box: [10, 6, 7],
        color: "#fef3c7",
        color2: "#fcd34d",
        size: 5,
        opacity: 0.9,
        additive: true,
        twinkle: 0.9,
        fallSpeed: 0.3,
        wrapY: [5, 12],
        driftAmp: [0.4, 0.1, 0.35],
        growBeat: 5,
        fadeFar: 30,
        span: 1.8,
      },
    ],
  },
  {
    // Ch 6 — under the canopy: moonlit indigo, lanterns
    beatId: "night",
    dir: "night",
    textSafe: "center",
    layers: [
      { id: "sky", kind: "sky", legacySrc: "/landing/backdrops/night.webp" },
    ],
    particles: [
      {
        // fireflies — slow amber wanderers with soft pulse
        id: "fireflies",
        count: 230,
        center: [0, 11.5, 0],
        box: [18, 9, 14],
        color: "#fbbf24",
        color2: "#f59e0b",
        size: 5,
        opacity: 0.95,
        additive: true,
        twinkle: 1,
        driftAmp: [0.9, 0.55, 0.7],
        driftFreq: 0.22,
        fadeFar: 44,
        growBeat: 6,
        span: 2.2,
      },
      {
        // the ❋ constellation, blooming for the finale
        id: "glyph",
        count: 0,
        positions: () => makeGlyphPositions(new THREE.Vector3(0, 19.4, -3.5), 1.85),
        color: "#fcd34d",
        color2: "#f59e0b",
        size: 9,
        opacity: 1,
        additive: true,
        twinkle: 0.35,
        driftAmp: [0.02, 0.02, 0.01],
        driftFreq: 0.4,
        fadeFar: 60,
        span: 2.2,
        opacityFn: (p) => THREE.MathUtils.smoothstep(p * SEGMENTS, 5.9, 6.75),
      },
      {
        // moonlit haze low over the canopy
        id: "haze",
        count: 260,
        center: [0, 10, -2],
        box: [22, 4, 14],
        color: "#93a6d4",
        color2: "#3d4a77",
        size: 9,
        opacity: 0.13,
        driftAmp: [0.5, 0.15, 0.4],
        driftFreq: 0.15,
        fadeFar: 44,
        growBeat: 6,
        span: 2.2,
      },
    ],
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
