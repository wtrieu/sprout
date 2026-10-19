import { NextRequest, NextResponse } from "next/server";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { atlasMaps, atlasNodes, atlasRungLevels, atlasRungs } from "@/db/schema";
import { reapStaleMaps } from "@/lib/atlas/runner";

export const GET = async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
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
        .select({ nodeId: atlasRungs.nodeId, level: atlasRungs.level, status: atlasRungs.status })
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
  for (const r of rungRows) {
    const entry = byNode.get(r.nodeId) ?? Object.fromEntries(atlasRungLevels.map((l) => [l, null]));
    entry[r.level] = r.status;
    byNode.set(r.nodeId, entry);
  }
  return NextResponse.json({
    map,
    nodes: nodes.map((n) => ({
      ...n,
      rungs: byNode.get(n.id) ?? Object.fromEntries(atlasRungLevels.map((l) => [l, null])),
    })),
  });
};

/** Remove a map (and, by cascade, its nodes, rungs, readings, picks). */
export const DELETE = async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const map = db.select().from(atlasMaps).where(eq(atlasMaps.id, Number(id))).get();
  if (!map) return NextResponse.json({ error: "not found" }, { status: 404 });
  db.delete(atlasMaps).where(eq(atlasMaps.id, map.id)).run();
  return NextResponse.json({ deleted: true });
};
