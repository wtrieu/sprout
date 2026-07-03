import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { materials, userMaterials } from "@/db/schema";

export const GET = () => {
  const all = db.select().from(materials).orderBy(materials.category, materials.name).all();
  const owned = new Set(db.select().from(userMaterials).all().map((u) => u.materialId));
  return NextResponse.json({
    materials: all.map((m) => ({ ...m, owned: owned.has(m.id) })),
  });
};

const PatchSchema = z.object({ materialId: z.number().int(), owned: z.boolean() });

export const PATCH = async (req: NextRequest) => {
  const body = PatchSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.message }, { status: 400 });
  }
  if (body.data.owned) {
    db.insert(userMaterials)
      .values({ materialId: body.data.materialId })
      .onConflictDoNothing()
      .run();
  } else {
    db.delete(userMaterials).where(eq(userMaterials.materialId, body.data.materialId)).run();
  }
  return NextResponse.json({ ok: true });
};
