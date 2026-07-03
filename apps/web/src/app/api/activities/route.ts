import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { activities } from "@/db/schema";

export const GET = () => {
  const rows = db.select().from(activities).orderBy(desc(activities.id)).limit(50).all();
  return NextResponse.json({ activities: rows });
};

const PatchSchema = z.object({
  id: z.number().int(),
  status: z.enum(["suggested", "done", "skipped"]),
});

export const PATCH = async (req: NextRequest) => {
  const body = PatchSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.message }, { status: 400 });
  }
  db.update(activities)
    .set({ status: body.data.status })
    .where(eq(activities.id, body.data.id))
    .run();
  return NextResponse.json({ ok: true });
};
