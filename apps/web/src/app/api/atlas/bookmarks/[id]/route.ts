import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { atlasBookmarks } from "@/db/schema";
import { listBookmarkViews } from "@/lib/atlas/kid";
import { spawnAtlasJob } from "@/lib/atlas/runner";

const PatchSchema = z.object({
  // "" (or null) clears the note.
  note: z.string().trim().max(600).nullable().optional(),
  targetAgeYears: z.number().int().min(1).max(25).nullable().optional(),
  regenerateKid: z.boolean().optional(),
});

const find = (id: string) => {
  const n = Number(id);
  return Number.isInteger(n)
    ? (db.select().from(atlasBookmarks).where(eq(atlasBookmarks.id, n)).get() ?? null)
    : null;
};

export const PATCH = async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const body = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message ?? "invalid" }, { status: 400 });
  }
  const bookmark = find(id);
  if (!bookmark) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { note, targetAgeYears, regenerateKid } = body.data;
  const set: Partial<typeof atlasBookmarks.$inferInsert> = {};
  if (note !== undefined) set.note = note || null;
  if (targetAgeYears !== undefined) set.targetAgeYears = targetAgeYears;
  if (regenerateKid) {
    set.kidStatus = "drafting";
    set.kidError = null;
  }
  if (Object.keys(set).length > 0) {
    db.update(atlasBookmarks).set(set).where(eq(atlasBookmarks.id, bookmark.id)).run();
  }
  if (regenerateKid) spawnAtlasJob(["kid", "--bookmark", String(bookmark.id)]);

  const [view] = listBookmarkViews(db, { id: bookmark.id });
  return NextResponse.json({ bookmark: view });
};

export const DELETE = async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const bookmark = find(id);
  if (!bookmark) return NextResponse.json({ error: "not found" }, { status: 404 });
  db.delete(atlasBookmarks).where(eq(atlasBookmarks.id, bookmark.id)).run();
  return NextResponse.json({ ok: true });
};
