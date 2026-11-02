import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { getAuthenticatedEmail } from "@/lib/auth";
import { acceptOffer, offerPayload, currentClass } from "@/lib/atlas/game/classes";
import { playerForEmail } from "@/lib/atlas/players";

const BodySchema = z.object({ choice: z.string().min(1).max(60) });

const STATUS = { "not-found": 404, "not-revealed": 409, "bad-choice": 400 } as const;

/** Accept one of an offer's classes (logged as accept_class; history is permanent). */
export const POST = async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const player = playerForEmail(db, getAuthenticatedEmail(req));
  if (!player) return NextResponse.json({ error: "no character" }, { status: 401 });
  const body = BodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message ?? "invalid" }, { status: 400 });
  }
  const result = acceptOffer(db, player.id, Number(id), body.data.choice);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: STATUS[result.error] });
  const cls = currentClass(db, player.id);
  return NextResponse.json({
    offer: offerPayload(result.offer),
    class: cls ? { id: cls.id, title: cls.title } : null,
  });
};
