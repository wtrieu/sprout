import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { sources, sourceSuggestions, crawlRuns } from "@/db/schema";

export const GET = () => {
  const allSources = db.select().from(sources).orderBy(sources.name).all();
  const suggestions = db
    .select()
    .from(sourceSuggestions)
    .where(eq(sourceSuggestions.status, "pending"))
    .orderBy(desc(sourceSuggestions.createdAt))
    .limit(50)
    .all();
  const recentRuns = db.select().from(crawlRuns).orderBy(desc(crawlRuns.id)).limit(20).all();
  return NextResponse.json({ sources: allSources, suggestions, recentRuns });
};

const PatchSchema = z.object({
  id: z.number().int(),
  enabled: z.boolean().optional(),
  status: z.enum(["approved", "pending", "rejected"]).optional(),
});

export const PATCH = async (req: NextRequest) => {
  const body = PatchSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.message }, { status: 400 });
  }
  const { id, ...changes } = body.data;
  if (Object.keys(changes).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }
  db.update(sources).set(changes).where(eq(sources.id, id)).run();
  return NextResponse.json({ ok: true });
};
