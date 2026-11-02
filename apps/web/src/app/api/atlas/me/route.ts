import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { getAuthenticatedEmail } from "@/lib/auth";
import { playerForEmail } from "@/lib/atlas/players";
import { meGamePayload, playerSummaries } from "@/lib/atlas/progress";

/**
 * Who am I in the Atlas, and who else lives here. `player` is null until
 * this email creates a character (or forever, for service tokens — they get
 * the read-only view). `players` is the household: everyone's name, persona
 * and account-wide levels — sharing inside the household is the one kind of
 * sharing there is.
 */
export const GET = (req: NextRequest) => {
  const email = getAuthenticatedEmail(req);
  const player = playerForEmail(db, email);
  const game = player ? meGamePayload(db, player) : null;
  return NextResponse.json({
    player: player && game ? { ...player, class: game.class, loadout: game.loadout } : null,
    achievements: game?.achievements ?? [],
    items: game?.items ?? [],
    class: game?.class ?? null,
    classHistory: game?.classHistory ?? [],
    totalLevel: game?.totalLevel ?? null,
    nextGate: game?.nextGate ?? null,
    canCreate: !!email && email !== "service-token" && !player,
    players: playerSummaries(db),
  });
};
