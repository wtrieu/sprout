/**
 * Single source of truth for the camera journey and the film's color script
 * (palette + sun + clouds per beat). One Beat per scroll section (8 total,
 * progress 0 → 1). What each beat is *made of* lives in layerManifest.ts.
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
  /** sun/moon direction (normalized-ish) and look */
  sunDir: [number, number, number];
  sunColor: string;
  sunSize: number;
  halo: number;
  /** 0 = clear sky, 1 = overcast */
  cloudAmount: number;
  cloudColor: string;
  cloudShadow: string;
  ground: string;
};

export const BEATS: Beat[] = [
  {
    // Hero — a wish adrift in the twilight underground
    id: "hero",
    camera: [0, -15.5, 5.5],
    lookAt: [0, -13.85, 0],
    fog: "#171233",
    fogNear: 2.5,
    fogFar: 20,
    skyTop: "#120e2e",
    skyBottom: "#33245c",
    ambient: "#8b7ab8",
    ambientIntensity: 0.55,
    key: "#d8c9f0",
    keyIntensity: 0.5,
    accent: "#f0abfc",
    sunDir: [0, 1, 0],
    sunColor: "#c084fc",
    sunSize: 0.0004,
    halo: 0,
    cloudAmount: 0,
    cloudColor: "#33245c",
    cloudShadow: "#171233",
    ground: "#14102a",
  },
  {
    // Ch 1 — the root system glowing through plum-dark soil
    id: "roots",
    camera: [2.2, -8.5, 7.5],
    lookAt: [0, -7.6, 0],
    fog: "#1e1432",
    fogNear: 2.5,
    fogFar: 22,
    skyTop: "#170f28",
    skyBottom: "#3a2352",
    ambient: "#8a6aa0",
    ambientIntensity: 0.55,
    key: "#e8b45a",
    keyIntensity: 0.6,
    accent: "#ffd9a0",
    sunDir: [0, 1, 0],
    sunColor: "#e8b45a",
    sunSize: 0.0004,
    halo: 0,
    cloudAmount: 0,
    cloudColor: "#3a2352",
    cloudShadow: "#1e1432",
    ground: "#191128",
  },
  {
    // Ch 2 — first rain: storm-light, a puddle, a paper boat
    id: "rain",
    camera: [0, 2, 11.5],
    lookAt: [0, 2.4, -1.5],
    fog: "#1b2940",
    fogNear: 4,
    fogFar: 46,
    skyTop: "#16233c",
    skyBottom: "#31486b",
    ambient: "#48628c",
    ambientIntensity: 0.6,
    key: "#8fc3e8",
    keyIntensity: 0.7,
    accent: "#7dd3fc",
    sunDir: [0.3, 0.45, -0.85],
    sunColor: "#a8c6de",
    sunSize: 0.0005,
    halo: 0.12,
    cloudAmount: 0.78,
    cloudColor: "#8494ad",
    cloudShadow: "#222c42",
    ground: "#1d2733",
  },
  {
    // Ch 3 — the sprout breaks through into a violet-amber dawn
    id: "sprout",
    camera: [2.9, 2, 8],
    lookAt: [-0.4, 1.5, 0],
    fog: "#4a2c1a",
    fogNear: 4,
    fogFar: 50,
    skyTop: "#3d2a52",
    skyBottom: "#ff9a3c",
    ambient: "#a05e28",
    ambientIntensity: 0.65,
    key: "#ffb347",
    keyIntensity: 1.2,
    accent: "#fbbf24",
    sunDir: [0.6, 0.14, -0.79],
    sunColor: "#ffb347",
    sunSize: 0.002,
    halo: 0.55,
    cloudAmount: 0.34,
    cloudColor: "#ffd9a0",
    cloudShadow: "#6b4038",
    ground: "#33251a",
  },
  {
    // Ch 4 — growing wild under a blue anime noon
    id: "sapling",
    camera: [-5.5, 4.2, 13.5],
    lookAt: [0.8, 3.2, 0],
    fog: "#89aed6",
    fogNear: 10,
    fogFar: 90,
    skyTop: "#2b5fb8",
    skyBottom: "#b7dcf2",
    ambient: "#7d9cc4",
    ambientIntensity: 0.85,
    key: "#fff2cf",
    keyIntensity: 1.25,
    accent: "#34d399",
    sunDir: [0.35, 0.75, -0.55],
    sunColor: "#fff2cf",
    sunSize: 0.0011,
    halo: 0.28,
    cloudAmount: 0.52,
    cloudColor: "#ffffff",
    cloudShadow: "#8fa9cc",
    ground: "#33502c",
  },
  {
    // Ch 5 — in bloom at violet golden hour, pink clouds
    id: "bloom",
    camera: [4, 8.5, 11.5],
    lookAt: [-0.6, 8.8, 0],
    fog: "#5a3524",
    fogNear: 6,
    fogFar: 60,
    skyTop: "#6b3fa0",
    skyBottom: "#ff8c42",
    ambient: "#a86a30",
    ambientIntensity: 0.7,
    key: "#ffc06b",
    keyIntensity: 1.3,
    accent: "#fcd34d",
    sunDir: [-0.55, 0.16, -0.75],
    sunColor: "#ffab52",
    sunSize: 0.0019,
    halo: 0.6,
    cloudAmount: 0.42,
    cloudColor: "#ffc9de",
    cloudShadow: "#7a4a6b",
    ground: "#4a3a1c",
  },
  {
    // Ch 6 — under the canopy: moonlit indigo, lanterns, fireflies
    id: "night",
    camera: [1.5, 10, 12.5],
    lookAt: [0, 12.4, -2],
    fog: "#10142e",
    fogNear: 5,
    fogFar: 55,
    skyTop: "#0a0f33",
    skyBottom: "#2a3a7a",
    ambient: "#39406e",
    ambientIntensity: 0.55,
    key: "#aebde0",
    keyIntensity: 0.5,
    accent: "#f59e0b",
    sunDir: [-0.35, 0.6, -0.72],
    sunColor: "#dfe9ff",
    sunSize: 0.0009,
    halo: 0.22,
    cloudAmount: 0.14,
    cloudColor: "#54639a",
    cloudShadow: "#131a3d",
    ground: "#101426",
  },
  {
    // Finale — the ❋ glows among the branches
    id: "cta",
    camera: [0, 13.2, 9.5],
    lookAt: [0, 15.6, -2],
    fog: "#0c102a",
    fogNear: 4,
    fogFar: 50,
    skyTop: "#070b26",
    skyBottom: "#1d2a5e",
    ambient: "#39406e",
    ambientIntensity: 0.55,
    key: "#f59e0b",
    keyIntensity: 0.75,
    accent: "#f59e0b",
    sunDir: [-0.3, 0.5, -0.8],
    sunColor: "#dfe9ff",
    sunSize: 0.0008,
    halo: 0.18,
    cloudAmount: 0.1,
    cloudColor: "#54639a",
    cloudShadow: "#131a3d",
    ground: "#0e1222",
  },
];

export const SEGMENTS = BEATS.length - 1;

/** 0..1 local progress of beat i: 0 while approaching from beat i-1, 1 at beat i. */
export function localProgress(progress: number, beat: number): number {
  const x = progress * SEGMENTS - beat + 1;
  return Math.min(1, Math.max(0, x));
}
