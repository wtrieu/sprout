import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { atlasBookmarks, atlasMaps, atlasNodes, atlasRungLevels, atlasRungs } from "@/db/schema";
import { getAuthenticatedEmail } from "@/lib/auth";
import { personaLine } from "@/lib/atlas/persona";
import { playerForEmail } from "@/lib/atlas/players";
import { defaultLapsedOffers } from "@/lib/atlas/game/classes";
import { mapGamePayload, mapGreetingCounts, mapProgressFor } from "@/lib/atlas/progress";
import { reapStaleMaps } from "@/lib/atlas/runner";
import { setSetting } from "@/lib/settings";

export const GET = async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  reapStaleMaps(db);
  const map = db.select().from(atlasMaps).where(eq(atlasMaps.id, Number(id))).get();
  if (!map) return NextResponse.json({ error: "not found" }, { status: 404 });

  const nodes = db
    .select()
    .from(atlasNodes)
    .where(eq(atlasNodes.mapId, map.id))
    .orderBy(asc(atlasNodes.position), asc(atlasNodes.id))
    .all();
  const rungRows = nodes.length
    ? db
        .select({
          nodeId: atlasRungs.nodeId,
          level: atlasRungs.level,
          status: atlasRungs.status,
          quizJson: atlasRungs.quizJson,
        })
        .from(atlasRungs)
        .where(
          inArray(
            atlasRungs.nodeId,
            nodes.map((n) => n.id),
          ),
        )
        .all()
    : [];
  const byNode = new Map<number, Record<string, string | null>>();
  let quizlessCount = 0;
  for (const r of rungRows) {
    const entry = byNode.get(r.nodeId) ?? Object.fromEntries(atlasRungLevels.map((l) => [l, null]));
    entry[r.level] = r.status;
    byNode.set(r.nodeId, entry);
    // Pre-PR-A one-pagers were written without a quiz; the preload backfills
    // them, and the page needs to know there is something to prepare.
    if (r.level === "onepager" && r.status === "ready" && !r.quizJson) quizlessCount += 1;
  }

  const bookmarkedNodeIds = nodes.length
    ? db
        .select({ nodeId: atlasBookmarks.nodeId })
        .from(atlasBookmarks)
        .where(
          inArray(
            atlasBookmarks.nodeId,
            nodes.map((n) => n.id),
          ),
        )
        .all()
        .map((r) => r.nodeId)
    : [];

  const player = playerForEmail(db, getAuthenticatedEmail(req));
  // Offers past their soft deadline take the first option on this load.
  if (player) defaultLapsedOffers(db, player.id);
  const progress = player ? mapProgressFor(db, player.id, map.id) : null;
  const game = player && progress ? mapGamePayload(db, player, progress.totalLevel) : null;
  const greeting = player
    ? personaLine(
        player.persona,
        "map_greeting",
        {
          name: player.name,
          mapTitle: map.title,
          ...mapGreetingCounts(db, player.id, map.id),
        },
        // Stable for the day, fresh tomorrow.
        `${map.id}:${new Date().toISOString().slice(0, 10)}`,
      )
    : null;

  return NextResponse.json({
    map,
    nodes: nodes.map((n) => ({
      ...n,
      rungs: byNode.get(n.id) ?? Object.fromEntries(atlasRungLevels.map((l) => [l, null])),
    })),
    quizlessCount,
    bookmarkedNodeIds,
    player:
      player && game
        ? {
            id: player.id,
            name: player.name,
            persona: player.persona,
            class: game.class,
            loadout: game.loadout,
          }
        : null,
    pending: game?.pending ?? null,
    nextGate: game?.nextGate ?? null,
    progress,
    greeting,
  });
};

const PatchSchema = z.object({ active: z.literal(true) });

/** Make this the map the weekly frontier note draws from. */
export const PATCH = async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const body = PatchSchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json({ error: "expected { active: true }" }, { status: 400 });
  }
  const map = db.select().from(atlasMaps).where(eq(atlasMaps.id, Number(id))).get();
  if (!map) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (map.status !== "ready") {
    return NextResponse.json({ error: "Only a ready map can be the active one." }, { status: 409 });
  }
  setSetting(db, "atlasActiveMapId", map.id);
  return NextResponse.json({ active: true, mapId: map.id });
};

/** Remove a map (and, by cascade, its nodes, rungs, readings, picks). */
export const DELETE = async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const map = db.select().from(atlasMaps).where(eq(atlasMaps.id, Number(id))).get();
  if (!map) return NextResponse.json({ error: "not found" }, { status: 404 });
  db.delete(atlasMaps).where(eq(atlasMaps.id, map.id)).run();
  return NextResponse.json({ deleted: true });
};
