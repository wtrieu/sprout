/**
 * What is waiting for the next map screen: queued achievements (with their
 * loot) and an undecided class offer. Nothing reveals mid-lesson — the node
 * page never reads this; the map does, and POSTs /reveals when the modal
 * opens, which is what flips queued to revealed and starts the offer's
 * soft deadline.
 */
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { DB } from "../../../db/client";
import { atlasAchievements, atlasClassOffers } from "../../../db/schema";
import { logEvent } from "../events";
import { itemsByAchievement } from "./achievements";
import { OFFER_DEADLINE_DAYS, offerPayload, parseOptions, type OfferPayload } from "./classes";

export type PendingAchievement = {
  id: number;
  slug: string;
  title: string;
  flavor: string;
  hidden: boolean;
  items: Array<{ id: number; kind: string; ref: string | null }>;
};

export type Pending = { achievements: PendingAchievement[]; offer: OfferPayload | null };

export const pendingFor = (db: DB, playerId: number): Pending => {
  const rows = db
    .select()
    .from(atlasAchievements)
    .where(and(eq(atlasAchievements.playerId, playerId), isNull(atlasAchievements.revealedAt)))
    .orderBy(asc(atlasAchievements.id))
    .all();
  const items = itemsByAchievement(
    db,
    playerId,
    rows.map((r) => r.id),
  );
  const offer = db
    .select()
    .from(atlasClassOffers)
    .where(
      and(
        eq(atlasClassOffers.playerId, playerId),
        inArray(atlasClassOffers.status, ["queued", "revealed"]),
      ),
    )
    .orderBy(asc(atlasClassOffers.id))
    .get();
  return {
    achievements: rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      flavor: r.flavor,
      hidden: r.hidden,
      items: items.get(r.id) ?? [],
    })),
    offer: offer ? offerPayload(offer) : null,
  };
};

/**
 * Mark everything queued as revealed (once), log it, and return the set the
 * modal shows: the achievements revealed just now, plus the undecided offer.
 */
export const revealPending = (db: DB, playerId: number, now = new Date()): Pending => {
  const before = pendingFor(db, playerId);
  for (const a of before.achievements) {
    db.update(atlasAchievements)
      .set({ revealedAt: now })
      .where(and(eq(atlasAchievements.id, a.id), isNull(atlasAchievements.revealedAt)))
      .run();
    logEvent(db, {
      playerId,
      verb: "reveal_loot",
      at: now,
      data: { achievementId: a.id, slug: a.slug, itemIds: a.items.map((i) => i.id) },
    });
  }
  let offer = before.offer;
  if (offer?.status === "queued") {
    const deadline = new Date(now.getTime() + OFFER_DEADLINE_DAYS * 24 * 60 * 60 * 1000);
    const row = db
      .update(atlasClassOffers)
      .set({ status: "revealed", deadline })
      .where(eq(atlasClassOffers.id, offer.id))
      .returning()
      .get();
    logEvent(db, {
      playerId,
      verb: "offer_class",
      at: now,
      data: {
        offerId: row.id,
        gateLevel: row.gateLevel,
        classIds: parseOptions(row).flatMap((o) => (o ? [o.classId] : [])),
        deadline: deadline.toISOString(),
      },
    });
    offer = offerPayload(row);
  }
  return { achievements: before.achievements, offer };
};
