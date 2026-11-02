import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { atlasPersonas } from "@/db/schema";
import { getAuthenticatedEmail } from "@/lib/auth";
import { LoadoutPatchSchema, equipLoadout } from "@/lib/atlas/game/loadout";
import { playerForEmail, updatePlayer } from "@/lib/atlas/players";
import { playerGameView } from "@/lib/atlas/progress";

const PatchSchema = z
  .object({
    name: z.string().trim().min(2).max(40).optional(),
    persona: z.enum(atlasPersonas).optional(),
    loadout: LoadoutPatchSchema.optional(),
  })
  .refine((b) => b.name !== undefined || b.persona !== undefined || b.loadout !== undefined, {
    message: "nothing to change",
  });

/** Rename, switch persona (logged as choose_persona), or equip a loadout (logged as equip). */
export const PATCH = async (req: NextRequest) => {
  const player = playerForEmail(db, getAuthenticatedEmail(req));
  if (!player) return NextResponse.json({ error: "no character" }, { status: 401 });
  const body = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message ?? "invalid" }, { status: 400 });
  }
  const { loadout, ...profile } = body.data;
  if (loadout) {
    const equipped = equipLoadout(db, player.id, loadout);
    if (!equipped.ok) return NextResponse.json({ error: equipped.error }, { status: 400 });
  }
  const updated = updatePlayer(db, player.id, profile);
  return NextResponse.json({
    player: updated ? { ...updated, ...playerGameView(db, updated) } : null,
  });
};
