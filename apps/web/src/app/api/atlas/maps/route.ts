import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { atlasMaps, atlasNodes, atlasRungs } from "@/db/schema";
import { getPreset, presetKeys } from "@/lib/atlas/presets";
import { enqueueMapDraft, reapStaleMaps } from "@/lib/atlas/runner";

export const GET = () => {
  reapStaleMaps(db);
  const maps = db.select().from(atlasMaps).orderBy(desc(atlasMaps.id)).all();
  const nodes = db
    .select({ id: atlasNodes.id, mapId: atlasNodes.mapId, visitedAt: atlasNodes.visitedAt })
    .from(atlasNodes)
    .all();
  const statusByNode = (level: "eli10" | "onepager") =>
    new Map(
      db
        .select({ nodeId: atlasRungs.nodeId, status: atlasRungs.status })
        .from(atlasRungs)
        .where(eq(atlasRungs.level, level))
        .all()
        .map((r) => [r.nodeId, r.status]),
    );
  const onepagers = statusByNode("onepager");
  const eli10s = statusByNode("eli10");
  const settled = (s: string | undefined) => s === "ready" || s === "failed";
  const empty = { nodeCount: 0, visitedCount: 0, onepagerReadyCount: 0, eli10ReadyCount: 0, pendingPagesCount: 0 };
  const counts = new Map<number, typeof empty>();
  for (const n of nodes) {
    const c = counts.get(n.mapId) ?? { ...empty };
    c.nodeCount += 1;
    if (n.visitedAt) c.visitedCount += 1;
    const op = onepagers.get(n.id);
    const el = eli10s.get(n.id);
    if (op === "ready") c.onepagerReadyCount += 1;
    if (el === "ready") c.eli10ReadyCount += 1;
    // Pending = still to be drafted. A node whose one-pager failed is settled
    // (no eli10 can be written from it) — the same rule preload's ready email
    // uses, so the card never says "preparing" after the email has gone out.
    if (!settled(op)) c.pendingPagesCount += 1;
    if (op !== "failed" && !settled(el)) c.pendingPagesCount += 1;
    counts.set(n.mapId, c);
  }
  return NextResponse.json({
    maps: maps.map((m) => ({
      ...m,
      ...(counts.get(m.id) ?? { ...empty }),
    })),
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
 * Draft a new map. Drafts are strictly sequential, so the row is created
 * `drafting` (and the outline + children calls run detached — minutes of model
 * work) only when nothing else is drafting; otherwise it is created `queued`
 * and the finishing draft promotes it (runner.promoteNextQueuedMap). Either
 * way the Atlas page polls until the row flips to ready/failed.
 */
export const POST = async (req: NextRequest) => {
  const body = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message ?? "invalid" }, { status: 400 });
  }
  const preset = getPreset(body.data.preset);
  const title = body.data.title ?? preset?.title ?? "Untitled map";
  const brief = [preset?.brief, body.data.brief].filter(Boolean).join("\n\n") || null;
  const map = enqueueMapDraft(db, { title, brief });
  return NextResponse.json({ map }, { status: 202 });
};
