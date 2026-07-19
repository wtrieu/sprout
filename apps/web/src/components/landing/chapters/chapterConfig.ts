/**
 * Single source of truth for the camera journey, palette evolution and
 * Spline slots. One Beat per scroll section (8 total, progress 0 → 1).
 *
 * ────────────────────────────────────────────────────────────────────
 *  SPLINE SLOTS — PASTE YOUR SPLINE SCENE URL HERE
 *  Author a scene at https://spline.design, click Export → "Code" →
 *  copy the `.splinecode` URL, and set it as `splineUrl` on the beat
 *  you want it to appear over. It lazy-loads only when a URL is set,
 *  rendered full-viewport behind the copy for that chapter.
 * ────────────────────────────────────────────────────────────────────
 */
export type Beat = {
  id: string;
  /** camera position at this beat (world units, soil surface at y = 0) */
  camera: [number, number, number];
  /** what the camera looks at during this beat */
  lookAt: [number, number, number];
  fog: string;
  fogNear: number;
  fogFar: number;
  skyTop: string;
  skyBottom: string;
  ambient: string;
  ambientIntensity: number;
  key: string;
  keyIntensity: number;
  /** emotional accent for particles/emissives in this beat */
  accent: string;
  splineUrl: string | null;
};

export const BEATS: Beat[] = [
  {
    // Hero — the seed, deep underground
    id: "hero",
    camera: [0, -15.5, 5.5],
    lookAt: [0, -13.85, 0],
    fog: "#0c0a09",
    fogNear: 2,
    fogFar: 16,
    skyTop: "#0b0908",
    skyBottom: "#171009",
    ambient: "#4a3520",
    ambientIntensity: 0.35,
    key: "#f59e0b",
    keyIntensity: 0.5,
    accent: "#f59e0b",
    splineUrl: null,
  },
  {
    // Ch 1 — roots reaching through umber soil
    id: "roots",
    camera: [1.6, -9, 6],
    lookAt: [0, -8.2, 0],
    fog: "#171009",
    fogNear: 2,
    fogFar: 18,
    skyTop: "#120c07",
    skyBottom: "#241609",
    ambient: "#5b3a1a",
    ambientIntensity: 0.4,
    key: "#fb923c",
    keyIntensity: 0.6,
    accent: "#fb923c",
    splineUrl: null,
  },
  {
    // Ch 2 — first rain, breaching the surface into slate blue
    id: "rain",
    camera: [0, 1.6, 9.5],
    lookAt: [0, 2.8, -2],
    fog: "#141d29",
    fogNear: 3,
    fogFar: 30,
    skyTop: "#0d1420",
    skyBottom: "#1e2c3d",
    ambient: "#3b556e",
    ambientIntensity: 0.55,
    key: "#7dd3fc",
    keyIntensity: 0.7,
    accent: "#7dd3fc",
    splineUrl: null,
  },
  {
    // Ch 3 — the sprout breaks through at dawn (signature shot)
    id: "sprout",
    camera: [2.6, 2.1, 7],
    lookAt: [0, 1.3, 0],
    fog: "#2b1f12",
    fogNear: 3,
    fogFar: 34,
    skyTop: "#331f0c",
    skyBottom: "#5c3a14",
    ambient: "#7a5222",
    ambientIntensity: 0.6,
    key: "#fbbf24",
    keyIntensity: 1.1,
    accent: "#fbbf24",
    splineUrl: null,
  },
  {
    // Ch 4 — growing wild, verdant sapling
    id: "sapling",
    camera: [-3.2, 5.2, 10],
    lookAt: [0, 4.6, 0],
    fog: "#132116",
    fogNear: 4,
    fogFar: 38,
    skyTop: "#16281b",
    skyBottom: "#27401f",
    ambient: "#3f6b46",
    ambientIntensity: 0.65,
    key: "#fde68a",
    keyIntensity: 0.9,
    accent: "#34d399",
    splineUrl: null,
  },
  {
    // Ch 5 — in bloom, golden hour through the canopy
    id: "bloom",
    camera: [2.2, 9.6, 8.5],
    lookAt: [0, 10.2, 0],
    fog: "#2e2110",
    fogNear: 3,
    fogFar: 36,
    skyTop: "#3a2810",
    skyBottom: "#5f3f12",
    ambient: "#8a5a1e",
    ambientIntensity: 0.6,
    key: "#fcd34d",
    keyIntensity: 1.2,
    accent: "#fcd34d",
    splineUrl: null,
  },
  {
    // Ch 6 — under the canopy, indigo night, fireflies
    id: "night",
    camera: [0, 14, 10],
    lookAt: [0, 17, -4],
    fog: "#0d1024",
    fogNear: 4,
    fogFar: 44,
    skyTop: "#05061a",
    skyBottom: "#181a3c",
    ambient: "#2a2f55",
    ambientIntensity: 0.5,
    key: "#93a6d4",
    keyIntensity: 0.45,
    accent: "#f59e0b",
    splineUrl: null,
  },
  {
    // Finale — the ❋ glows among the branches
    id: "cta",
    camera: [0, 16.6, 7.5],
    lookAt: [0, 17.8, -2],
    fog: "#0a0c20",
    fogNear: 3,
    fogFar: 40,
    skyTop: "#040515",
    skyBottom: "#141633",
    ambient: "#2a2f55",
    ambientIntensity: 0.5,
    key: "#f59e0b",
    keyIntensity: 0.7,
    accent: "#f59e0b",
    splineUrl: null,
  },
];

export const SEGMENTS = BEATS.length - 1;

/** 0..1 local progress of beat i: 0 while approaching from beat i-1, 1 at beat i. */
export function localProgress(progress: number, beat: number): number {
  const x = progress * SEGMENTS - beat + 1;
  return Math.min(1, Math.max(0, x));
}
