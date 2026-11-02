import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { getAuthenticatedEmail } from "@/lib/auth";
import { revealPending } from "@/lib/atlas/game/pending";
import { playerForEmail } from "@/lib/atlas/players";

/**
 * The map screen's reveal modal opened: mark this player's queued
 * achievements and class offer as revealed (logged as reveal_loot /
 * offer_class; the offer's 14-day soft deadline starts now) and return the
 * set. No body needed. Calling it again with nothing queued is a no-op.
 */
export const POST = async (req: NextRequest) => {
  const player = playerForEmail(db, getAuthenticatedEmail(req));
  if (!player) return NextResponse.json({ error: "no character" }, { status: 401 });
  return NextResponse.json(revealPending(db, player.id));
};
