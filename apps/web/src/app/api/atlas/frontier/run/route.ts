import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { activeMapId, currentPick, weekStartOf } from "@/lib/atlas/frontier";
import { spawnFrontierNote } from "@/lib/atlas/runner";

const BodySchema = z.object({ force: z.boolean().optional() });

/**
 * "Send this week's note" — the manual button for the test fortnight. Spawns
 * the same detached `note` run launchd does; without `force` a week that
 * already has its note is a no-op (the run itself would say so too).
 */
export const POST = async (req: NextRequest) => {
  const body = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message ?? "invalid" }, { status: 400 });
  }
  const force = body.data.force === true;
  if (activeMapId(db) === null) {
    return NextResponse.json({ error: "No ready map to pick from yet." }, { status: 409 });
  }
  if (!force && currentPick(db, weekStartOf(new Date()))) {
    return NextResponse.json({ started: false, reason: "already delivered" });
  }
  spawnFrontierNote(force);
  return NextResponse.json({ started: true, force }, { status: 202 });
};
