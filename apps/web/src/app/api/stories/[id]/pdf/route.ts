import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { stories, storyPages } from "@/db/schema";

const IMAGES_DIR = path.resolve(process.cwd(), process.env.IMAGES_DIR ?? "../../data/images");

/** Landscape picture-book PDF: image left, large text right. */
export const GET = async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;
  const story = db.select().from(stories).where(eq(stories.id, Number(id))).get();
  if (!story) return NextResponse.json({ error: "not found" }, { status: 404 });
  const pages = db
    .select()
    .from(storyPages)
    .where(eq(storyPages.storyId, story.id))
    .orderBy(asc(storyPages.pageIndex))
    .all();

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 792; // 11in landscape letter
  const H = 612;

  // Cover
  const cover = pdf.addPage([W, H]);
  const title = story.title ?? "A Sprout Story";
  const titleSize = 36;
  cover.drawText(title, {
    x: (W - font.widthOfTextAtSize(title, titleSize)) / 2,
    y: H / 2,
    size: titleSize,
    font,
    color: rgb(0.2, 0.15, 0.05),
  });

  for (const page of pages) {
    const p = pdf.addPage([W, H]);
    const imgFile = page.imagePath ? path.join(IMAGES_DIR, page.imagePath) : null;
    if (imgFile && fs.existsSync(imgFile)) {
      const bytes = fs.readFileSync(imgFile);
      // Legacy FLUX renders are PNG; curated uploads are normalized to JPEG.
      const img = imgFile.toLowerCase().endsWith(".png")
        ? await pdf.embedPng(bytes)
        : await pdf.embedJpg(bytes);
      const box = Math.min(H - 80, W / 2 - 60);
      const scale = Math.min(box / img.width, box / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      p.drawImage(img, { x: 40 + (box - w) / 2, y: (H - h) / 2, width: w, height: h });
    }
    // Simple word-wrap for the right column.
    const textX = W / 2 + 20;
    const maxWidth = W / 2 - 60;
    const fontSize = 22;
    const words = page.text.split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
      const candidate = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(candidate, fontSize) > maxWidth && line) {
        lines.push(line);
        line = w;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
    const startY = H / 2 + (lines.length * 30) / 2;
    lines.forEach((l, i) => {
      p.drawText(l, {
        x: textX,
        y: startY - i * 30,
        size: fontSize,
        font,
        color: rgb(0.15, 0.15, 0.15),
      });
    });
  }

  const bytes = await pdf.save();
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${(story.title ?? "story").replace(/[^\w ]/g, "")}.pdf"`,
    },
  });
};
