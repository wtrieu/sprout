import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { z } from "zod";

const BodySchema = z.object({
  /** Optional parent request ("a book about excavators"). */
  topic: z.string().trim().max(200).optional(),
});

/**
 * "Write a book now" — on-demand story creation, one level below the premise
 * inbox's "Generate now": commissions a small premise batch (optionally
 * steered by the parent's topic), keeps the best candidate, and writes the
 * book immediately through the full write→judge pipeline. Spawned detached
 * (same pattern as greenlight — model work takes minutes and must survive
 * request timeouts); the draft appears on the Stories page when it lands.
 */
export const POST = async (req: NextRequest) => {
  const body = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json(
      { error: "body must be { topic?: string (≤200 chars) }" },
      { status: 400 },
    );
  }
  const topic = body.data.topic;

  const child = spawn(
    "pnpm",
    ["run", "job:express-story", ...(topic ? ["--topic", topic] : [])],
    {
      cwd: process.cwd(), // apps/web in dev and under launchd (pnpm --filter)
      detached: true,
      stdio: ["ignore", "ignore", "ignore"],
      env: process.env,
    },
  );
  child.unref();

  return NextResponse.json({ ok: true, started: "job:express-story", topic: topic ?? null });
};
