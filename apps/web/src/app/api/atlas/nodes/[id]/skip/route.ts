import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { atlasNodes } from "@/db/schema";

const BodySchema = z.object({ skipped: z.boolean() });

/**
 * "Skip this branch": drops the node (and, through the picker's parent
 * check, its children) out of frontier selection. The UI posts the branch's
 * id to skip a whole branch; posting false un-skips.
 */
export const POST = async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const body = BodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message ?? "invalid" }, { status: 400 });
  }
  const node = db.select().from(atlasNodes).where(eq(atlasNodes.id, Number(id))).get();
  if (!node) return NextResponse.json({ error: "not found" }, { status: 404 });
  const updated = db
    .update(atlasNodes)
    .set({ skipped: body.data.skipped, skippedAt: body.data.skipped ? new Date() : null })
    .where(eq(atlasNodes.id, node.id))
    .returning()
    .get();
  return NextResponse.json({ node: updated });
};
