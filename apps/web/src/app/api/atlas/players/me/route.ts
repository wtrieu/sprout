import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { atlasPersonas } from "@/db/schema";
import { getAuthenticatedEmail } from "@/lib/auth";
import { playerForEmail, updatePlayer } from "@/lib/atlas/players";

const PatchSchema = z
  .object({
    name: z.string().trim().min(2).max(40).optional(),
    persona: z.enum(atlasPersonas).optional(),
  })
  .refine((b) => b.name !== undefined || b.persona !== undefined, {
    message: "nothing to change",
  });

/** Rename, or switch persona (logged as choose_persona). */
export const PATCH = async (req: NextRequest) => {
  const player = playerForEmail(db, getAuthenticatedEmail(req));
  if (!player) return NextResponse.json({ error: "no character" }, { status: 401 });
  const body = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message ?? "invalid" }, { status: 400 });
  }
  return NextResponse.json({ player: updatePlayer(db, player.id, body.data) });
};
