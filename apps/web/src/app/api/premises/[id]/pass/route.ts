import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { premises } from "@/db/schema";
import { rejectReasonKeys } from "@/lib/stories/engine";

const BodySchema = z.object({
  reason: z.enum(rejectReasonKeys as [string, ...string[]]).optional(),
});

/** Pass on a premise (optional one-tap reason chip). Passes are taste signal. */
export const POST = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;
  const body = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json({ error: "invalid reason" }, { status: 400 });
  }
  const premise = db.select().from(premises).where(eq(premises.id, Number(id))).get();
  if (!premise) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (premise.status !== "proposed") {
    return NextResponse.json(
      { error: `only proposed premises can be passed (status: ${premise.status})` },
      { status: 409 },
    );
  }
  const updated = db
    .update(premises)
    .set({ status: "passed", passReason: body.data.reason ?? null, decidedAt: new Date() })
    .where(eq(premises.id, premise.id))
    .returning()
    .get();
  return NextResponse.json({ premise: updated });
};
