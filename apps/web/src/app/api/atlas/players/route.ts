import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { atlasPersonas } from "@/db/schema";
import { getAuthenticatedEmail } from "@/lib/auth";
import { LookSchema, lookToLoadout, type Loadout } from "@/lib/atlas/game/loadout";
import { createPlayer } from "@/lib/atlas/players";

const CreateSchema = z.object({
  name: z.string().trim().min(2).max(40),
  persona: z.enum(atlasPersonas),
  // Optional starting look: base parts per slot and swap-group tones.
  look: LookSchema.optional(),
});

/**
 * Character creation. The email comes from Cloudflare Access, never the
 * body. The first character ever created inherits the pre-player progress
 * (visited nodes, read rungs) as imported events; later ones start fresh.
 * A `look` becomes the starting loadout; without one the loadout stays null.
 */
export const POST = async (req: NextRequest) => {
  const email = getAuthenticatedEmail(req);
  if (!email || email === "service-token") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message ?? "invalid" }, { status: 400 });
  }
  const { look, ...profile } = body.data;
  let loadout: Loadout | null = null;
  if (look) {
    const built = lookToLoadout(look);
    if (!built.ok) return NextResponse.json({ error: built.error }, { status: 400 });
    loadout = built.loadout;
  }
  const res = createPlayer(db, { email, ...profile, loadout });
  if (!res.ok) {
    return res.error === "exists"
      ? NextResponse.json({ error: "this email already has a character" }, { status: 409 })
      : NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(
    { player: res.player, importedEvents: res.importedEvents },
    { status: 201 },
  );
};
