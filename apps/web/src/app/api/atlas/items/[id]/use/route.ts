import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { getAuthenticatedEmail } from "@/lib/auth";
import { useItem as applyItem } from "@/lib/atlas/game/items";
import { playerForEmail } from "@/lib/atlas/players";

/**
 * Use a functional item (respec token, fog reveal, rare-node key). A refused
 * use consumes nothing; the error says why (409) so the UI can say it kindly.
 */
export const POST = async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const player = playerForEmail(db, getAuthenticatedEmail(req));
  if (!player) return NextResponse.json({ error: "no character" }, { status: 401 });
  const result = applyItem(db, player.id, Number(id));
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.error === "not-found" ? 404 : 409 },
    );
  }
  return NextResponse.json({
    kind: result.kind,
    revealed: result.revealed,
    offerId: result.offer?.id ?? null,
  });
};
