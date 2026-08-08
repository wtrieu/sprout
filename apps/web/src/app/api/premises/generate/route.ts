import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { db } from "@/db/client";
import { MAX_PENDING_PREMISES, pendingPremiseCount } from "@/lib/stories/premises";

/**
 * "Generate now" — run the story engine on demand instead of waiting for the
 * nightly 5am run. Spawns job:stories detached (same pattern as greenlight
 * and the jobs "run now" spawn — model work takes minutes and must survive
 * request timeouts): a fresh premise batch lands in the inbox a minute or two
 * later, and any greenlit leftovers get their books written.
 *
 * When the inbox is already full the nightly script would silently skip
 * stage A — surface that as a 409 so the button gives honest feedback.
 */
export const POST = async () => {
  const pending = pendingPremiseCount(db);
  if (pending >= MAX_PENDING_PREMISES) {
    return NextResponse.json(
      {
        error: `the inbox already has ${pending} premises waiting — greenlight or pass some first`,
      },
      { status: 409 },
    );
  }

  const child = spawn("pnpm", ["run", "job:stories"], {
    cwd: process.cwd(), // apps/web in dev and under launchd (pnpm --filter)
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
    env: process.env,
  });
  child.unref();

  return NextResponse.json({ ok: true, started: "job:stories" });
};
