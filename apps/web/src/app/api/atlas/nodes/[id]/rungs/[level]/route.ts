import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { atlasNodes } from "@/db/schema";
import { isRungLevel, markRungDrafting, rungFor } from "@/lib/atlas/rungs";
import { RUNG_STALE_MS, isStale, spawnAtlasJob } from "@/lib/atlas/runner";

const BodySchema = z.object({ force: z.boolean().optional() });

/**
 * Draft one rung. Returns the ready rung if it already exists (unless
 * forced), 409 while a fresh draft is in flight, else marks the row
 * `drafting` and spawns the detached run — the page polls the node until
 * the row flips.
 */
export const POST = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string; level: string }> },
) => {
  const { id, level } = await params;
  if (!isRungLevel(level)) return NextResponse.json({ error: "unknown rung" }, { status: 400 });
  const body = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message ?? "invalid" }, { status: 400 });
  }
  const node = db.select().from(atlasNodes).where(eq(atlasNodes.id, Number(id))).get();
  if (!node) return NextResponse.json({ error: "not found" }, { status: 404 });

  const force = body.data.force === true;
  const existing = rungFor(db, node.id, level);
  if (existing?.status === "ready" && !force) return NextResponse.json({ rung: existing });
  if (existing?.status === "drafting" && !isStale(existing.startedAt, RUNG_STALE_MS)) {
    return NextResponse.json(
      { error: "Already drafting — usually about a minute.", rung: existing },
      { status: 409 },
    );
  }

  const rung = markRungDrafting(db, node.id, level);
  spawnAtlasJob(["rung", "--node", String(node.id), "--level", level, ...(force ? ["--force"] : [])]);
  return NextResponse.json({ rung }, { status: 202 });
};
