import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { children, chatSessions, chatMessages } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ageInMonths } from "@/lib/age";
import {
  routeIntents,
  buildAskContext,
  composeAnswer,
  sessionHistory,
  type Turn,
} from "@/lib/skills/ask";
import { isLocked } from "@/lib/jobs";

const BodySchema = z.object({
  question: z.string().min(2).max(2000),
  sessionId: z.number().int().optional(),
});

export const POST = async (req: NextRequest) => {
  const body = BodySchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.message }, { status: 400 });
  }

  // The orchestrator may be mid image-batch — the chat model can't fit
  // alongside FLUX in 24GB, so bounce politely rather than thrash swap.
  if (isLocked(db)) {
    return NextResponse.json(
      { error: "Sprout is busy generating (nightly batch or story images). Try again in a few minutes." },
      { status: 503 },
    );
  }

  const child = db.select().from(children).limit(1).get();
  if (!child) {
    return NextResponse.json({ error: "Set up the child profile first." }, { status: 400 });
  }
  const months = ageInMonths(child.dob);

  let sessionId = body.data.sessionId;
  let history: Turn[] = [];
  if (!sessionId) {
    const session = db
      .insert(chatSessions)
      .values({ childId: child.id, title: body.data.question.slice(0, 80) })
      .returning({ id: chatSessions.id })
      .get();
    sessionId = session.id;
  } else if (!db.select().from(chatSessions).where(eq(chatSessions.id, sessionId)).get()) {
    return NextResponse.json({ error: "unknown session" }, { status: 404 });
  } else {
    history = sessionHistory(db, sessionId);
  }

  db.insert(chatMessages)
    .values({ sessionId, role: "user", content: body.data.question })
    .run();

  // Agentic path (lib/skills/ask.ts): classify what the question needs, build
  // that context deterministically (growth math, milestones, journal, corpus),
  // compose with conversation history so follow-ups work.
  const routed = await routeIntents(body.data.question, history);
  const ctx = await buildAskContext(db, body.data.question, routed, months, child.dob);

  if (ctx.blocks.length === 0 && ctx.retrieved.length === 0) {
    const msg =
      "I don't have any sourced material covering that yet. The corpus grows as the nightly crawler runs — or add a source on the Sources page.";
    db.insert(chatMessages)
      .values({ sessionId, role: "assistant", content: msg, citations: [] })
      .run();
    return NextResponse.json({ sessionId, answer: msg, citations: [] });
  }

  const answer = await composeAnswer({
    question: body.data.question,
    months,
    childName: child.name,
    history,
    ctx,
  });
  // Citations always come from retrieval metadata, never model output.
  const citations = ctx.citations;

  db.insert(chatMessages)
    .values({ sessionId, role: "assistant", content: answer, citations })
    .run();

  return NextResponse.json({ sessionId, answer, citations });
};
