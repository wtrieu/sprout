import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { children } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ageInMonths, formatAge } from "@/lib/age";

export const GET = async () => {
  const child = db.select().from(children).limit(1).get();
  if (!child) return NextResponse.json({ child: null });
  const months = ageInMonths(child.dob);
  return NextResponse.json({
    child: { ...child, ageMonths: months, ageLabel: formatAge(months) },
  });
};

const PutSchema = z.object({
  name: z.string().min(1).max(100),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const PUT = async (req: NextRequest) => {
  const body = PutSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.message }, { status: 400 });
  }
  const existing = db.select().from(children).limit(1).get();
  if (existing) {
    db.update(children)
      .set({ name: body.data.name, dob: body.data.dob })
      .where(eq(children.id, existing.id))
      .run();
  } else {
    db.insert(children).values(body.data).run();
  }
  return GET();
};
