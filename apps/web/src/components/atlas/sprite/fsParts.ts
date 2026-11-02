/**
 * Test-only: read the committed manifest and part PNGs from disk (pngjs) so
 * the pure compositor can run in Node. The app itself never decodes PNGs in
 * Node — the browser composes on a canvas.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import type { ImageSource, Rgba } from "./compose";
import { parseManifest, partImagePath, type SpriteManifest } from "./manifest";

export const SPRITE_DIR = path.resolve(process.cwd(), "public/sprite/classic");

export const readManifest = (): SpriteManifest =>
  parseManifest(JSON.parse(readFileSync(path.join(SPRITE_DIR, "manifest.json"), "utf8")));

export const readPng = (file: string): Rgba => {
  const png = PNG.sync.read(readFileSync(file));
  return { width: png.width, height: png.height, data: png.data };
};

/** Absolute file path of a part frame, mirroring the public URL layout. */
export const partFile = (...args: Parameters<typeof partImagePath>): string =>
  path.join(process.cwd(), "public", partImagePath(...args));

export const fsSource =
  (m: SpriteManifest): ImageSource =>
  (part, anim, frame) => {
    try {
      return readPng(partFile(m.style, part, anim, frame));
    } catch {
      return null;
    }
  };
