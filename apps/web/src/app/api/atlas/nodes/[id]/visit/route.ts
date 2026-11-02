import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { atlasFrontierPicks, atlasNodes, atlasRungLevels, atlasRungs } from "@/db/schema";
import { getAuthenticatedEmail } from "@/lib/auth";
import { logEvent } from "@/lib/atlas/events";
import { onEventsLogged } from "@/lib/atlas/game/hooks";
import { playerForEmail } from "@/lib/atlas/players";
import { rungFor } from "@/lib/atlas/rungs";

const BodySchema = z.object({
  rung: z.enum(atlasRungLevels).optional(),
  from: z.enum(["note"]).optional(),
});

/**
 * The atlas's memory: opening a node marks it visited (first time) and
 * most-recently-opened (every time); reading a ready rung bumps its read
 * count; arriving from the weekly note stamps that pick as opened. The node
 * columns stay the SHARED memory (the picker and the weekly note read
 * them); the per-player record is the event this also appends when the
 * request belongs to a character.
 */
export const POST = async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const body = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message ?? "invalid" }, { status: 400 });
  }
  const node = db.select().from(atlasNodes).where(eq(atlasNodes.id, Number(id))).get();
  if (!node) return NextResponse.json({ error: "not found" }, { status: 404 });
  const player = playerForEmail(db, getAuthenticatedEmail(req));

  const now = new Date();
  db.update(atlasNodes)
    .set({ visitedAt: node.visitedAt ?? now, lastOpenedAt: now, visitCount: node.visitCount + 1 })
    .where(eq(atlasNodes.id, node.id))
    .run();
  if (player && !body.data.rung) {
    logEvent(db, {
      playerId: player.id,
      verb: "open_node",
      mapId: node.mapId,
      nodeId: node.id,
      // The weekly note derives "opened" from this event.
      data: body.data.from === "note" ? { from: "note" } : null,
    });
  }

  if (body.data.rung) {
    const rung = rungFor(db, node.id, body.data.rung);
    if (rung?.status === "ready") {
      db.update(atlasRungs)
        .set({ readAt: rung.readAt ?? now, readCount: rung.readCount + 1 })
        .where(eq(atlasRungs.id, rung.id))
        .run();
      if (player) {
        logEvent(db, {
          playerId: player.id,
          verb: "read_rung",
          mapId: node.mapId,
          nodeId: node.id,
          data: { level: body.data.rung },
        });
      }
    }
  }

  // After every event this request wrote: earn what the log now earns.
  if (player) onEventsLogged(db, player.id);

  if (body.data.from === "note") {
    const pick = db
      .select({ id: atlasFrontierPicks.id })
      .from(atlasFrontierPicks)
      .where(and(eq(atlasFrontierPicks.nodeId, node.id), isNull(atlasFrontierPicks.openedAt)))
      .orderBy(desc(atlasFrontierPicks.id))
      .get();
    if (pick) {
      db.update(atlasFrontierPicks)
        .set({ openedAt: now })
        .where(eq(atlasFrontierPicks.id, pick.id))
        .run();
    }
  }

  return NextResponse.json({ ok: true });
};
