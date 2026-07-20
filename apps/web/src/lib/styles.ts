import { and, eq } from "drizzle-orm";
import stylePacksJson from "./stylePacks.json";
import type { DB } from "../db/client";
import { characterStyleRefs } from "../db/schema";
import { enqueue } from "./jobs";

export type StylePack = { name: string; description: string; block: string };

export const stylePacks: Record<string, StylePack> = stylePacksJson.packs;

export const styleKeys = Object.keys(stylePacks);

export const DEFAULT_STYLE = "watercolor";

/** Resolve a requested style: unknown/absent/"surprise" → random pack. */
export const resolveStyle = (requested?: string | null): string => {
  if (requested && requested in stylePacks) return requested;
  return styleKeys[Math.floor(Math.random() * styleKeys.length)];
};

/**
 * Make sure a (character, style) reference sheet exists or is queued — the
 * image worker renders references before pages within a batch, so enqueueing
 * alongside the story jobs is enough.
 */
export const ensureStyleRef = (db: DB, characterId: number, styleKey: string): void => {
  const existing = db
    .select({ id: characterStyleRefs.id })
    .from(characterStyleRefs)
    .where(
      and(eq(characterStyleRefs.characterId, characterId), eq(characterStyleRefs.styleKey, styleKey)),
    )
    .get();
  if (existing) return;
  enqueue(db, {
    type: "char_reference",
    lane: "imagegen",
    payload: { characterId, styleKey },
    priority: 1,
  });
};
