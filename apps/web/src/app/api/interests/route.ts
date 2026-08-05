import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { desc } from "drizzle-orm";
import { db } from "@/db/client";
import { interests } from "@/db/schema";

export const GET = () => {
  const rows = db.select().from(interests).orderBy(desc(interests.weight), desc(interests.id)).all();
  return NextResponse.json({
    northStars: rows.filter((r) => r.kind === "north-star" && r.status === "active"),
    interests: rows.filter((r) => r.kind === "interest" && r.status === "active"),
    suggestions: rows.filter((r) => r.status === "suggested"),
  });
};

const CreateSchema = z.object({
  kind: z.enum(["north-star", "interest"]),
  label: z.string().min(2).max(60),
  brief: z.string().min(5).max(400),
  weight: z.number().int().min(1).max(5).optional(),
  share: z.number().min(0.05).max(0.5).optional(),
  tags: z.array(z.string().min(2).max(30)).max(8).optional(),
});

export const POST = async (req: NextRequest) => {
  const body = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message ?? "invalid" }, { status: 400 });
  }
  const { kind, label, brief, weight, share, tags } = body.data;
  const row = db
    .insert(interests)
    .values({
      kind,
      label,
      brief,
      weight: weight ?? 3,
      share: kind === "north-star" ? (share ?? 0.2) : null,
      tags: (tags ?? [label]).map((t) => t.toLowerCase()),
      source: "manual",
      status: "active",
    })
    .returning()
    .get();
  return NextResponse.json({ interest: row });
};
