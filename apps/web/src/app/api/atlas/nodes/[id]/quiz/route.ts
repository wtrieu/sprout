import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { atlasNodes } from "@/db/schema";
import { getAuthenticatedEmail } from "@/lib/auth";
import { logEvent } from "@/lib/atlas/events";
import { onEventsLogged } from "@/lib/atlas/game/hooks";
import { personaLine } from "@/lib/atlas/persona";
import { playerForEmail } from "@/lib/atlas/players";
import { nodeProgressFor } from "@/lib/atlas/progress";
import { AnswersSchema, gradeQuiz, parseQuizJson } from "@/lib/atlas/quiz";
import { rungFor } from "@/lib/atlas/rungs";

/**
 * Answer a node's quiz — the gate to "mastered". Grading happens here (the
 * stored quiz carries the answers and never leaves the server); every
 * attempt lands in the event log, raw material for PR-D's nightly pass.
 * Retry freely, no cost; a pass is permanent — re-takes change nothing,
 * because the tier derives from the existence of a pass_quiz event.
 */
export const POST = async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const player = playerForEmail(db, getAuthenticatedEmail(req));
  if (!player) return NextResponse.json({ error: "no character" }, { status: 401 });

  const body = AnswersSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message ?? "invalid" }, { status: 400 });
  }
  const node = db.select().from(atlasNodes).where(eq(atlasNodes.id, Number(id))).get();
  if (!node) return NextResponse.json({ error: "not found" }, { status: 404 });
  const onepager = rungFor(db, node.id, "onepager");
  const quiz = onepager?.status === "ready" ? parseQuizJson(onepager.quizJson) : null;
  if (!quiz) return NextResponse.json({ error: "this node has no quiz yet" }, { status: 409 });

  const result = gradeQuiz(quiz, body.data.answers);
  logEvent(db, {
    playerId: player.id,
    verb: result.passed ? "pass_quiz" : "fail_quiz",
    mapId: node.mapId,
    nodeId: node.id,
    data: { score: result.score, answers: body.data.answers },
  });
  onEventsLogged(db, player.id);
  const progress = nodeProgressFor(db, player.id, node.id);
  return NextResponse.json({
    ...result,
    passedAt: progress.quiz.passedAt,
    attempts: progress.quiz.attempts,
    tier: progress.tier,
    personaLine: personaLine(
      player.persona,
      result.passed ? "quiz_pass" : "quiz_fail",
      { name: player.name, nodeTitle: node.title },
      `${node.id}:${progress.quiz.attempts}`,
    ),
  });
};
