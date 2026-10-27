import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { atlasMaps } from "@/db/schema";
import { spawnPreloadShards } from "@/lib/atlas/runner";

/**
 * (Re-)spawn the preload shards for a map: the "Prepare the rest" button,
 * and the backfill for maps drafted before preloading existed. Idempotent in
 * effect — ready one-pagers are no-ops and a drafting rung is skipped, so
 * re-pressing while a preload runs wastes nothing but the spawns.
 */
export const POST = async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const map = db.select().from(atlasMaps).where(eq(atlasMaps.id, Number(id))).get();
  if (!map) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (map.status !== "ready") {
    return NextResponse.json(
      { error: "The map itself is still drafting — the preload starts when it's done." },
      { status: 409 },
    );
  }
  const shards = spawnPreloadShards(map.id);
  return NextResponse.json({ started: true, shards }, { status: 202 });
};
