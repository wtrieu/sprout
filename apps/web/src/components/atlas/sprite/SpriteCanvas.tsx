"use client";

import { useEffect, useRef, useState } from "react";
import { selectionFromLoadout, type Loadout } from "../loadout";
import { composeFrame, resolveFrame, type Rgba } from "./compose";
import { loadManifest, partImagePath, type AnimName, type SpriteManifest } from "./manifest";

const manifests = new Map<string, Promise<SpriteManifest | null>>();
const images = new Map<string, Promise<Rgba | null>>();

const manifestFor = (style: string) => {
  let p = manifests.get(style);
  if (!p) {
    p = loadManifest(style);
    manifests.set(style, p);
  }
  return p;
};

/** Decode a part PNG into RGBA via an offscreen canvas (browser only). */
const imageFor = (url: string): Promise<Rgba | null> => {
  let p = images.get(url);
  if (!p) {
    p = new Promise<Rgba | null>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0);
        resolve(ctx.getImageData(0, 0, c.width, c.height));
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
    images.set(url, p);
  }
  return p;
};

/** The cached manifest: undefined while loading, null when missing. */
export const useSpriteManifest = (style = "classic"): SpriteManifest | null | undefined => {
  const [manifest, setManifest] = useState<SpriteManifest | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    manifestFor(style).then((m) => live && setManifest(m));
    return () => {
      live = false;
    };
  }, [style]);
  return manifest;
};

/** Shown while the manifest loads, and permanently if it is missing. */
export function SpriteFallback({
  scale,
  label,
  missing,
}: {
  scale: number;
  label: string;
  missing?: boolean;
}) {
  return (
    <div
      role="img"
      aria-label={label}
      title={missing ? "Character art unavailable" : undefined}
      data-sprite-fallback={missing ? "missing" : "loading"}
      style={{ width: 32 * scale, height: 40 * scale }}
      className="flex items-end justify-center rounded-md bg-neutral-800/60"
    >
      <span className="pb-1 text-neutral-600" style={{ fontSize: 10 * scale }}>
        {missing ? "?" : "…"}
      </span>
    </div>
  );
}

/**
 * The character: loadout parts composed (pure compositor) from the manifest,
 * painted on a canvas and looped. Idle is two frames; pass `anim="celebrate"`
 * for the four-frame cheer. Falls back to a plain placeholder when the
 * manifest or its art is missing, so the page never breaks on art.
 */
export function SpriteCanvas({
  loadout,
  tones,
  anim = "idle",
  scale = 3,
  style = "classic",
  label = "Your character",
}: {
  loadout?: Loadout | null;
  tones?: Record<string, string>;
  anim?: AnimName;
  scale?: number;
  style?: string;
  label?: string;
}) {
  const manifest = useSpriteManifest(style);
  const [frames, setFrames] = useState<ImageData[] | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const loadoutKey = JSON.stringify([loadout?.sprite ?? {}, tones ?? {}]);
  useEffect(() => {
    if (!manifest) return;
    let live = true;
    const sel = selectionFromLoadout(manifest, loadout, tones);
    const wanted = Object.values(sel.parts).flatMap((id) => {
      const part = manifest.parts.find((p) => p.id === id);
      if (!part) return [];
      return Array.from({ length: manifest.animations[anim].frames }, (_, f) => {
        const r = resolveFrame(manifest, part, anim, f);
        return { part, ...r, url: partImagePath(style, part, r.anim, r.frame) };
      });
    });
    Promise.all(wanted.map((w) => imageFor(w.url))).then((decoded) => {
      if (!live) return;
      const byUrl = new Map(wanted.map((w, i) => [w.url, decoded[i]]));
      const out: ImageData[] = [];
      for (let f = 0; f < manifest.animations[anim].frames; f += 1) {
        const rgba = composeFrame(manifest, sel, anim, f, (part, a, fr) =>
          byUrl.get(partImagePath(style, part, a, fr)) ?? null,
        );
        out.push(new ImageData(new Uint8ClampedArray(rgba.data), rgba.width, rgba.height));
      }
      setFrames(out);
    });
    return () => {
      live = false;
    };
    // loadoutKey stands in for the loadout/tones objects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifest, anim, style, loadoutKey]);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !frames || !manifest) return;
    ctx.putImageData(frames[0], 0, 0);
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (still || frames.length < 2) return;
    let i = 0;
    const t = setInterval(() => {
      i = (i + 1) % frames.length;
      ctx.putImageData(frames[i], 0, 0);
    }, 1000 / manifest.animations[anim].fps);
    return () => clearInterval(t);
  }, [frames, manifest, anim]);

  if (manifest === undefined) return <SpriteFallback scale={scale} label={label} />;
  if (manifest === null) return <SpriteFallback scale={scale} label={label} missing />;
  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={label}
      width={manifest.canvas.width}
      height={manifest.canvas.height}
      style={{
        width: manifest.canvas.width * scale,
        height: manifest.canvas.height * scale,
        imageRendering: "pixelated",
      }}
    />
  );
}
