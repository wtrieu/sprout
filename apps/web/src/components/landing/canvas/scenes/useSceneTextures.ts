import * as THREE from "three";
import type { Tier } from "../../hooks/quality";

/**
 * Windowed texture residency for the painted cards. Beats within
 * [current − 1, current + 2] load; on low/mid tiers, textures outside that
 * window are disposed and reload on re-approach (high tier keeps visited
 * textures resident to avoid re-decode hitches on up-scroll). Every file is
 * optional — a missing file marks the entry "missing" and the card simply
 * never shows.
 */

type EntryStatus = "idle" | "loading" | "ready" | "missing";

export type PoolEntry = {
  status: EntryStatus;
  texture: THREE.Texture | null;
  urls: string[];
  beat: number;
  resizeWidth?: number;
};

const pool = new Map<string, PoolEntry>();

/** low tier decodes at half width — half the GPU memory, invisible at card distances */
export function decodeWidthForTier(tier: Tier): number | undefined {
  return tier === "low" ? 1280 : undefined;
}

async function fetchBitmapTexture(url: string, resizeWidth: number): Promise<THREE.Texture> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status}`);
  const blob = await res.blob();
  const bmp = await createImageBitmap(blob, {
    imageOrientation: "flipY",
    resizeWidth,
    resizeQuality: "high",
  } as ImageBitmapOptions);
  const tex = new THREE.CanvasTexture(bmp);
  tex.flipY = false; // already flipped at decode
  return tex;
}

async function loadFirst(entry: PoolEntry): Promise<THREE.Texture | null> {
  for (const url of entry.urls) {
    try {
      const tex =
        entry.resizeWidth && typeof createImageBitmap === "function"
          ? await fetchBitmapTexture(url, entry.resizeWidth)
          : await new THREE.TextureLoader().loadAsync(url);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      return tex;
    } catch {
      // try the next candidate; all failing just means no art yet
    }
  }
  return null;
}

/** Request a texture for `key`; starts the load on first call. */
export function ensureEntry(
  key: string,
  urls: string[],
  beat: number,
  resizeWidth?: number,
): PoolEntry {
  let entry = pool.get(key);
  if (!entry) {
    entry = { status: "idle", texture: null, urls, beat, resizeWidth };
    pool.set(key, entry);
  }
  if (entry.status === "idle") {
    entry.status = "loading";
    void loadFirst(entry).then((tex) => {
      if (entry.status !== "loading") {
        // swept or torn down while in flight
        tex?.dispose();
        return;
      }
      entry.texture = tex;
      entry.status = tex ? "ready" : "missing";
    });
  }
  return entry;
}

/**
 * Dispose ready textures whose beat has left the residency window. "missing"
 * is never swept — re-probing files that aren't there would 404 on every
 * approach.
 */
export function sweepPool(currentBeat: number, tier: Tier): void {
  if (tier === "high") return;
  pool.forEach((entry) => {
    if (entry.status !== "ready") return;
    const d = entry.beat - currentBeat;
    if (d < -2 || d > 3) {
      entry.texture?.dispose();
      entry.texture = null;
      entry.status = "idle";
    }
  });
}

/** Full teardown when the experience unmounts. */
export function disposePool(): void {
  pool.forEach((entry) => {
    entry.texture?.dispose();
  });
  pool.clear();
}
