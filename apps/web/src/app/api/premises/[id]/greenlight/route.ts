import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { premises } from "@/db/schema";

/**
 * Greenlight a premise: mark it and kick an immediate detached book-write
 * (same pattern as the jobs "run now" spawn — model work takes minutes and
 * must survive request timeouts), so the full draft is reviewable minutes
 * later. If the spawn dies, the nightly run retries greenlit leftovers.
 */
export const POST = async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;
  const premise = db.select().from(premises).where(eq(premises.id, Number(id))).get();
  if (!premise) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (premise.status !== "proposed") {
    return NextResponse.json(
      { error: `only proposed premises can be greenlit (status: ${premise.status})` },
      { status: 409 },
    );
  }
  const updated = db
    .update(premises)
    .set({ status: "greenlit", decidedAt: new Date() })
    .where(eq(premises.id, premise.id))
    .returning()
    .get();

  const child = spawn("pnpm", ["run", "job:write-book", "--premise", String(premise.id)], {
    cwd: process.cwd(), // apps/web in dev and under launchd (pnpm --filter)
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
    env: process.env,
  });
  child.unref();

  return NextResponse.json({ premise: updated, writing: true });
};
