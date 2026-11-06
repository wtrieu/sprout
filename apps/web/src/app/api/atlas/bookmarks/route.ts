import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { atlasBookmarks, atlasNodes, children } from "@/db/schema";
import { getAuthenticatedEmail } from "@/lib/auth";
import { logEvent } from "@/lib/atlas/events";
import { onEventsLogged } from "@/lib/atlas/game/hooks";
import { listBookmarkViews } from "@/lib/atlas/kid";
import { playerForEmail } from "@/lib/atlas/players";
import { spawnAtlasJob } from "@/lib/atlas/runner";

/** Newest first; `?nodeId=N` narrows to one node's bookmark. */
export const GET = (req: NextRequest) => {
  const raw = req.nextUrl.searchParams.get("nodeId");
  const nodeId = raw === null ? undefined : Number(raw);
  if (nodeId !== undefined && !Number.isInteger(nodeId)) {
    return NextResponse.json({ error: "nodeId must be an integer" }, { status: 400 });
  }
  const bookmarks = listBookmarkViews(db, { nodeId });
  // The bookmark's own child when there is one, else the household's first.
  const childId = bookmarks.length
    ? db
        .select({ childId: atlasBookmarks.childId })
        .from(atlasBookmarks)
        .where(eq(atlasBookmarks.id, bookmarks[0].id))
        .get()?.childId
    : undefined;
  const child =
    (childId === undefined
      ? undefined
      : db.select().from(children).where(eq(children.id, childId)).get()) ??
    db.select().from(children).orderBy(asc(children.id)).limit(1).get();
  return NextResponse.json({ childName: child?.name ?? null, bookmarks });
};

const CreateSchema = z.object({
  nodeId: z.number().int(),
  note: z.string().trim().max(600).optional(),
  targetAgeYears: z.number().int().min(1).max(25).nullable().optional(),
});

/**
 * Save a node for the child. The row lands as `drafting` (the column
 * default) and the kid version is written by a detached job; the bookmarks
 * page polls the row. Household data, so it works without a character; the
 * event is logged only when the request belongs to one.
 */
export const POST = async (req: NextRequest) => {
  const body = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message ?? "invalid" }, { status: 400 });
  }
  const node = db.select().from(atlasNodes).where(eq(atlasNodes.id, body.data.nodeId)).get();
  if (!node) return NextResponse.json({ error: "node not found" }, { status: 404 });
  const child = db.select().from(children).orderBy(asc(children.id)).limit(1).get();
  if (!child) {
    return NextResponse.json(
      { error: "Add a child profile first — a saved idea needs a child to be re-told for." },
      { status: 400 },
    );
  }
  if (db.select({ id: atlasBookmarks.id }).from(atlasBookmarks).where(eq(atlasBookmarks.nodeId, node.id)).get()) {
    return NextResponse.json({ error: "already saved for the child" }, { status: 409 });
  }

  let bookmark: typeof atlasBookmarks.$inferSelect;
  try {
    bookmark = db
      .insert(atlasBookmarks)
      .values({
        nodeId: node.id,
        childId: child.id,
        note: body.data.note || null,
        targetAgeYears: body.data.targetAgeYears ?? null,
      })
      .returning()
      .get();
  } catch {
    // The unique index won a race with the check above.
    return NextResponse.json({ error: "already saved for the child" }, { status: 409 });
  }

  const player = playerForEmail(db, getAuthenticatedEmail(req));
  if (player) {
    logEvent(db, {
      playerId: player.id,
      verb: "save_for_child",
      mapId: node.mapId,
      nodeId: node.id,
      data: { bookmarkId: bookmark.id },
    });
    onEventsLogged(db, player.id);
  }

  spawnAtlasJob(["kid", "--bookmark", String(bookmark.id)]);
  const [view] = listBookmarkViews(db, { id: bookmark.id });
  return NextResponse.json({ bookmark: view }, { status: 201 });
};
