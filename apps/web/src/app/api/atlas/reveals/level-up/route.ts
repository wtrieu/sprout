import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { getAuthenticatedEmail } from "@/lib/auth";
import { acknowledgeLevelUp } from "@/lib/atlas/game/pending";
import { playerForEmail } from "@/lib/atlas/players";

const BodySchema = z.object({ throughEventId: z.number().int().positive() });

/**
 * The map screen's reveal modal showed a level-up: acknowledge it through
 * the `throughEventId` the pending payload carried (logged as reveal_level),
 * so it never shows again while anything earned after it still will.
 * Repeating it, or sending an id at or below the last ack, is a no-op.
 */
export const POST = async (req: NextRequest) => {
  const player = playerForEmail(db, getAuthenticatedEmail(req));
  if (!player) return NextResponse.json({ error: "no character" }, { status: 401 });
  const body = BodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message ?? "invalid" }, { status: 400 });
  }
  return NextResponse.json({ acknowledged: acknowledgeLevelUp(db, player.id, body.data.throughEventId) });
};
