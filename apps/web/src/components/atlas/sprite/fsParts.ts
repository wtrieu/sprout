/**
 * Test-only: read the committed manifest and part PNGs from disk (pngjs) so
 * the pure compositor can run in Node. The app itself never decodes PNGs in
 * Node — the browser composes on a canvas.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import type { ImageSource, Rgba } from "./compose";
import { parseManifest, partImagePath, type SpriteManifest } from "./manifest";

export const SPRITE_DIR = path.resolve(process.cwd(), "public/sprite/classic");

export const SPRITE_ROOT = path.resolve(process.cwd(), "public/sprite");

/** Every style directory (one holding a manifest.json) under public/sprite. */
export const listStyles = (): string[] =>
  readdirSync(SPRITE_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && readdirSync(path.join(SPRITE_ROOT, d.name)).includes("manifest.json"))
    .map((d) => d.name)
    .sort();

export const readManifest = (style = "classic"): SpriteManifest =>
  parseManifest(JSON.parse(readFileSync(path.join(SPRITE_ROOT, style, "manifest.json"), "utf8")));

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
