import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { interests } from "@/db/schema";

const PatchSchema = z.object({
  label: z.string().min(2).max(60).optional(),
  brief: z.string().min(5).max(400).optional(),
  weight: z.number().int().min(1).max(5).optional(),
  share: z.number().min(0.05).max(0.5).nullable().optional(),
  tags: z.array(z.string().min(2).max(30)).max(8).optional(),
  // 'active' confirms a suggestion; 'archived' retires anything.
  status: z.enum(["active", "archived"]).optional(),
});

export const PATCH = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;
  const body = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message ?? "invalid" }, { status: 400 });
  }
  const existing = db.select().from(interests).where(eq(interests.id, Number(id))).get();
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  const confirming = existing.status === "suggested" && body.data.status === "active";
  const row = db
    .update(interests)
    .set({
      ...body.data,
      ...(body.data.tags ? { tags: body.data.tags.map((t) => t.toLowerCase()) } : {}),
      // Confirming a suggestion starts its decay clock fresh.
      ...(confirming ? { lastReinforcedAt: new Date() } : {}),
    })
    .where(eq(interests.id, existing.id))
    .returning()
    .get();
  return NextResponse.json({ interest: row });
};

export const DELETE = async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;
  const row = db.select().from(interests).where(eq(interests.id, Number(id))).get();
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  db.delete(interests).where(eq(interests.id, row.id)).run();
  return NextResponse.json({ deleted: true });
};
