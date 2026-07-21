import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { db } from "@/db/client";
import { stories, storyPages } from "@/db/schema";
import { finalizeStoryIfComplete } from "@/lib/stories/finalize";
import { resolveImagePath, storyUploadDir } from "@/lib/stories/files";

const ACCEPTED = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_BYTES = 25 * 1024 * 1024;
const MAX_EDGE = 2048;

/**
 * Upload a page's illustration (multipart, field "file"). Accepted for
 * approved stories (and ready ones, to allow swapping a page after the fact).
 * The image is normalized to JPEG so the PDF route and the serving route only
 * ever deal with png/jpg.
 */
export const POST = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string; pageIndex: string }> },
) => {
  const { id, pageIndex } = await params;
  const storyId = Number(id);
  const pageIdx = Number(pageIndex);
  if (!Number.isInteger(storyId) || !Number.isInteger(pageIdx)) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }

  const story = db.select().from(stories).where(eq(stories.id, storyId)).get();
  if (!story) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (story.status !== "approved" && story.status !== "ready") {
    return NextResponse.json(
      { error: `uploads are only accepted for approved stories (status: ${story.status})` },
      { status: 409 },
    );
  }
  const page = db
    .select()
    .from(storyPages)
    .where(and(eq(storyPages.storyId, storyId), eq(storyPages.pageIndex, pageIdx)))
    .get();
  if (!page) return NextResponse.json({ error: "page not found" }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "multipart field 'file' required" }, { status: 400 });
  }
  if (!ACCEPTED.has(file.type)) {
    return NextResponse.json(
      { error: `unsupported type ${file.type || "unknown"} — use png, jpeg, or webp` },
      { status: 415 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "file too large (max 25 MB)" }, { status: 413 });
  }

  const input = Buffer.from(await file.arrayBuffer());
  let jpeg: Buffer;
  try {
    jpeg = await sharp(input)
      .rotate() // honor EXIF orientation from phone camera rolls
      .resize(MAX_EDGE, MAX_EDGE, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer();
  } catch {
    return NextResponse.json({ error: "could not decode image" }, { status: 415 });
  }

  const dir = storyUploadDir(storyId);
  fs.mkdirSync(dir, { recursive: true });
  // Timestamped name so a re-upload busts the serving route's day-long cache.
  const relPath = path.join("uploads", `story-${storyId}`, `page-${pageIdx}-${Date.now()}.jpg`);
  fs.writeFileSync(path.join(dir, path.basename(relPath)), jpeg);

  // Replacing an earlier upload (or a legacy render): remove the old file.
  if (page.imagePath && page.imagePath !== relPath) {
    const old = resolveImagePath(page.imagePath);
    if (old) fs.rmSync(old, { force: true });
  }

  const updated = db
    .update(storyPages)
    .set({ imagePath: relPath, imageStatus: "done", qcStatus: null, qcNote: null })
    .where(eq(storyPages.id, page.id))
    .returning()
    .get();

  finalizeStoryIfComplete(db, storyId);
  const freshStory = db.select().from(stories).where(eq(stories.id, storyId)).get();
  return NextResponse.json({ page: updated, story: freshStory });
};
