import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { db } from "@/db/client";
import { isLocked } from "@/lib/jobs";

/**
 * "Run now" — spawn the orchestrator (optionally with a crawl first) as a
 * detached process. API routes never execute jobs inline: LLM/image work
 * takes minutes and must survive request timeouts.
 */
export const POST = async (req: NextRequest) => {
  if (isLocked(db)) {
    return NextResponse.json({ error: "a run is already in progress" }, { status: 409 });
  }
  const { crawl } = (await req.json().catch(() => ({}))) as { crawl?: boolean };
  const script = crawl ? "job:nightly" : "job:run";

  const child = spawn("pnpm", ["run", script], {
    cwd: process.cwd(), // apps/web in dev and under launchd (pnpm --filter)
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
    env: process.env,
  });
  child.unref();

  return NextResponse.json({ ok: true, started: script });
};
