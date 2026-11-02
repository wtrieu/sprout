import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { desc } from "drizzle-orm";
import { db } from "@/db/client";
import { atlasSeeds } from "@/db/schema";
import { getAuthenticatedEmail } from "@/lib/auth";
import { logEvent } from "@/lib/atlas/events";
import { onEventsLogged } from "@/lib/atlas/game/hooks";
import { playerForEmail } from "@/lib/atlas/players";
import { detectSeedKind, extractSeedUrl } from "@/lib/atlas/seeds";

const view = (s: typeof atlasSeeds.$inferSelect) => ({
  id: s.id,
  text: s.text,
  kind: s.kind,
  url: s.url,
  status: s.status,
  resolution: s.resolution,
  nodeId: s.nodeId,
  mapId: s.mapId,
  createdAt: s.createdAt,
});

export const GET = () => {
  const seeds = db.select().from(atlasSeeds).orderBy(desc(atlasSeeds.createdAt), desc(atlasSeeds.id)).all();
  return NextResponse.json({
    seeds: seeds.map(view),
    pendingCount: seeds.filter((s) => s.status === "pending").length,
  });
};

const CreateSchema = z.object({ text: z.string().trim().min(2).max(500) });

/**
 * "Add to Atlas": store the seed as pending; the next draft (the weekly note,
 * or a new map's draft) places it. Household data — logged as an event only
 * when the request belongs to a character.
 */
export const POST = async (req: NextRequest) => {
  const body = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message ?? "invalid" }, { status: 400 });
  }
  const kind = detectSeedKind(body.data.text);
  const seed = db
    .insert(atlasSeeds)
    .values({
      text: body.data.text,
      kind,
      url: kind === "url" ? extractSeedUrl(body.data.text) : null,
    })
    .returning()
    .get();

  const player = playerForEmail(db, getAuthenticatedEmail(req));
  if (player) {
    logEvent(db, { playerId: player.id, verb: "add_seed", data: { seedId: seed.id, kind } });
    onEventsLogged(db, player.id);
  }
  return NextResponse.json({ seed: view(seed) }, { status: 201 });
};
