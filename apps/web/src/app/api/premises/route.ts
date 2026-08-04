import { NextRequest, NextResponse } from "next/server";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { premises } from "@/db/schema";

/**
 * The premise inbox: proposed premises ranked best-first (stage-A score),
 * plus recently decided ones so the phone page can show outcomes.
 */
export const GET = (req: NextRequest) => {
  const status = req.nextUrl.searchParams.get("status");
  const proposed = db
    .select()
    .from(premises)
    .where(eq(premises.status, "proposed"))
    .orderBy(desc(premises.score), desc(premises.id))
    .all();
  if (status === "proposed") return NextResponse.json({ premises: proposed });
  const recent = db
    .select()
    .from(premises)
    .where(inArray(premises.status, ["greenlit", "auto_picked", "written", "rejected", "passed"]))
    .orderBy(desc(premises.decidedAt), desc(premises.id))
    .limit(12)
    .all();
  return NextResponse.json({ premises: proposed, recent });
};
