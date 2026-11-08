import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { atlasBookmarks } from "@/db/schema";
import { listBookmarkViews, regenerateKid } from "@/lib/atlas/kid";

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

  const { note, targetAgeYears } = body.data;
  const set: Partial<typeof atlasBookmarks.$inferInsert> = {};
  if (note !== undefined) set.note = note || null;
  if (targetAgeYears !== undefined) set.targetAgeYears = targetAgeYears;
  if (Object.keys(set).length > 0) {
    db.update(atlasBookmarks).set(set).where(eq(atlasBookmarks.id, bookmark.id)).run();
  }
  // An atomic drafting claim: only the call that flips the row spawns the
  // job, so a double press cannot start two kid drafts (last writer wins).
  const regen = body.data.regenerateKid ? regenerateKid(db, bookmark.id) : null;

  const [view] = listBookmarkViews(db, { id: bookmark.id });
  if (regen?.status === "busy") {
    return NextResponse.json(
      { error: "Already drafting — usually about a minute.", bookmark: view },
      { status: 409 },
    );
  }
  return NextResponse.json({ bookmark: view });
};

export const DELETE = async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const bookmark = find(id);
  if (!bookmark) return NextResponse.json({ error: "not found" }, { status: 404 });
  db.delete(atlasBookmarks).where(eq(atlasBookmarks.id, bookmark.id)).run();
  return NextResponse.json({ ok: true });
};
