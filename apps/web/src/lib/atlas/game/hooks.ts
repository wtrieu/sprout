/**
 * The one call the event-writing routes make after they log: earn what the
 * log now earns, and queue a class offer if a gate was crossed. Both are
 * idempotent, so calling it after every write is the whole contract — and
 * neither reveals anything; reveals wait for the map screen.
 */
import type { DB } from "../../../db/client";
import { checkBaseAchievements, type GrantedAchievement } from "./achievements";
import { maybeCreateOffer, type OfferRow } from "./classes";

export const onEventsLogged = (
  db: DB,
  playerId: number,
): { granted: GrantedAchievement[]; offer: OfferRow | null } => {
  const granted = checkBaseAchievements(db, playerId);
  const offer = maybeCreateOffer(db, playerId);
  return { granted, offer };
};
