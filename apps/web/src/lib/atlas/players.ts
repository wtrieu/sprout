/**
 * Players — one character per person behind Cloudflare Access.
 *
 * There is no login UI and no switcher: Access already names the person on
 * every request (lib/auth.ts), so the email IS the identity. Service tokens
 * and unauthenticated requests get a read-only view: no character, no
 * events, no progress.
 */
import { eq } from "drizzle-orm";
import type { DB } from "../../db/client";
import { atlasPlayers, type AtlasPersona } from "../../db/schema";
import { importLegacyProgress, logEvent } from "./events";

export type PlayerRow = typeof atlasPlayers.$inferSelect;

/** Emails that can never own a character. */
const NOT_A_PERSON = new Set(["service-token"]);

export const playerForEmail = (db: DB, email: string | null): PlayerRow | null => {
  if (!email || NOT_A_PERSON.has(email)) return null;
  return db.select().from(atlasPlayers).where(eq(atlasPlayers.email, email)).get() ?? null;
};

export const listPlayers = (db: DB): PlayerRow[] => db.select().from(atlasPlayers).all();

export type CreatePlayerResult =
  | { ok: true; player: PlayerRow; importedEvents: number }
  | { ok: false; error: "exists" | "not-a-person" };

/**
 * Character creation. The FIRST character ever created inherits the
 * pre-player progress (visited nodes, read rungs) as imported events, in the
 * same transaction; later characters start fresh.
 */
export const createPlayer = (
  db: DB,
  input: { email: string; name: string; persona: AtlasPersona },
): CreatePlayerResult => {
  if (NOT_A_PERSON.has(input.email)) return { ok: false, error: "not-a-person" };
  if (playerForEmail(db, input.email)) return { ok: false, error: "exists" };
  const first = listPlayers(db).length === 0;
  return db.transaction((tx) => {
    const player = tx
      .insert(atlasPlayers)
      .values({ email: input.email, name: input.name.trim(), persona: input.persona })
      .returning()
      .get();
    const importedEvents = first ? importLegacyProgress(tx as unknown as DB, player.id) : 0;
    logEvent(tx as unknown as DB, {
      playerId: player.id,
      verb: "create_character",
      data: { persona: input.persona, importedEvents },
    });
    return { ok: true, player, importedEvents };
  });
};

export const updatePlayer = (
  db: DB,
  playerId: number,
  patch: { name?: string; persona?: AtlasPersona },
): PlayerRow | null => {
  const existing = db.select().from(atlasPlayers).where(eq(atlasPlayers.id, playerId)).get();
  if (!existing) return null;
  const updated = db
    .update(atlasPlayers)
    .set({
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.persona !== undefined ? { persona: patch.persona } : {}),
    })
    .where(eq(atlasPlayers.id, playerId))
    .returning()
    .get();
  if (patch.persona && patch.persona !== existing.persona) {
    logEvent(db, { playerId, verb: "choose_persona", data: { persona: patch.persona } });
  }
  return updated;
};
