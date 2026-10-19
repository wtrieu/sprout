import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { atlasMaps, atlasNodes } from "@/db/schema";
import { getPreset, presetKeys } from "@/lib/atlas/presets";
import { MAP_STALE_MS, isStale, reapStaleMaps, spawnAtlasJob } from "@/lib/atlas/runner";

export const GET = () => {
  reapStaleMaps(db);
  const maps = db.select().from(atlasMaps).orderBy(desc(atlasMaps.id)).all();
  const nodes = db
    .select({ mapId: atlasNodes.mapId, visitedAt: atlasNodes.visitedAt })
    .from(atlasNodes)
    .all();
  const counts = new Map<number, { nodeCount: number; visitedCount: number }>();
  for (const n of nodes) {
    const c = counts.get(n.mapId) ?? { nodeCount: 0, visitedCount: 0 };
    c.nodeCount += 1;
    if (n.visitedAt) c.visitedCount += 1;
    counts.set(n.mapId, c);
  }
  return NextResponse.json({
    maps: maps.map((m) => ({ ...m, ...(counts.get(m.id) ?? { nodeCount: 0, visitedCount: 0 }) })),
    presets: presetKeys,
  });
};

const CreateSchema = z
  .object({
    title: z.string().trim().min(2).max(80).optional(),
    brief: z.string().trim().max(4000).optional(),
    preset: z.enum(presetKeys as [string, ...string[]]).optional(),
  })
  .refine((b) => b.title || b.preset, { message: "a title or a preset is required" });

/**
 * Draft a new map. The row is created as `drafting` and the outline +
 * children calls run detached (minutes of model work); the Atlas page polls
 * until the row flips to ready/failed.
 */
export const POST = async (req: NextRequest) => {
  const body = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message ?? "invalid" }, { status: 400 });
  }
  const drafting = db
    .select({ id: atlasMaps.id, createdAt: atlasMaps.createdAt })
    .from(atlasMaps)
    .where(eq(atlasMaps.status, "drafting"))
    .get();
  if (drafting && !isStale(drafting.createdAt, MAP_STALE_MS)) {
    return NextResponse.json(
      { error: "A map is already drafting — give it a few minutes." },
      { status: 409 },
    );
  }
  const preset = getPreset(body.data.preset);
  const title = body.data.title ?? preset?.title ?? "Untitled map";
  const brief = [preset?.brief, body.data.brief].filter(Boolean).join("\n\n") || null;
  const map = db.insert(atlasMaps).values({ title, brief, status: "drafting" }).returning().get();
  spawnAtlasJob(["draft-map", "--map", String(map.id)]);
  return NextResponse.json({ map }, { status: 202 });
};
