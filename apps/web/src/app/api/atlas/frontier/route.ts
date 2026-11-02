import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { currentPick, pickView, weekStartOf } from "@/lib/atlas/frontier";

/**
 * This week's frontier pick, or `{ pick: null }`. Read-only: it never drafts
 * anything — a missing note is made by the weekly job (or the run route).
 * `opened` is derived from the event log (an open_node of the pick's node at
 * or after the pick, by any player), not from the pick's legacy column.
 */
export const GET = async () => {
  const pick = currentPick(db, weekStartOf(new Date()));
  const view = pick ? pickView(db, pick) : null;
  return NextResponse.json({ pick: view });
};
