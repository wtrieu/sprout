import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { atlasNodes } from "@/db/schema";
import { getAuthenticatedEmail } from "@/lib/auth";
import { logEvent } from "@/lib/atlas/events";
import { onEventsLogged } from "@/lib/atlas/game/hooks";
import { playerForEmail } from "@/lib/atlas/players";

const BodySchema = z.object({ skipped: z.boolean() });

/**
 * "Skip this branch": drops the node (and, through the picker's parent
 * check, its children) out of frontier selection. The UI posts the branch's
 * id to skip a whole branch; posting false un-skips. Skips stay SHARED —
 * they prune the map, they are not progress — but who skipped is logged.
 */
export const POST = async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const body = BodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message ?? "invalid" }, { status: 400 });
  }
  const node = db.select().from(atlasNodes).where(eq(atlasNodes.id, Number(id))).get();
  if (!node) return NextResponse.json({ error: "not found" }, { status: 404 });
  const updated = db
    .update(atlasNodes)
    .set({ skipped: body.data.skipped, skippedAt: body.data.skipped ? new Date() : null })
    .where(eq(atlasNodes.id, node.id))
    .returning()
    .get();
  const player = playerForEmail(db, getAuthenticatedEmail(req));
  if (player) {
    logEvent(db, {
      playerId: player.id,
      verb: body.data.skipped ? "skip_branch" : "unskip_branch",
      mapId: node.mapId,
      nodeId: node.id,
    });
    onEventsLogged(db, player.id);
  }
  return NextResponse.json({ node: updated });
};
