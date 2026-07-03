import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { jobs } from "@/db/schema";

const BodySchema = z.object({ id: z.number().int() });

export const POST = async (req: NextRequest) => {
  const body = BodySchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.message }, { status: 400 });
  }
  db.update(jobs)
    .set({ status: "pending", attempts: 0, error: null })
    .where(eq(jobs.id, body.data.id))
    .run();
  return NextResponse.json({ ok: true });
};
