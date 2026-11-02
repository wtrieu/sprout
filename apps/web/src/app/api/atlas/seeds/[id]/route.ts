import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { atlasSeeds } from "@/db/schema";

/** Remove a seed in any status; a node it already created stays on the map. */
export const DELETE = async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const n = Number(id);
  const seed = Number.isInteger(n)
    ? db.select({ id: atlasSeeds.id }).from(atlasSeeds).where(eq(atlasSeeds.id, n)).get()
    : undefined;
  if (!seed) return NextResponse.json({ error: "not found" }, { status: 404 });
  db.delete(atlasSeeds).where(eq(atlasSeeds.id, seed.id)).run();
  return NextResponse.json({ ok: true });
};
