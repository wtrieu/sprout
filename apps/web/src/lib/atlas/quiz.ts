/**
 * The quiz — the gate to "mastered" on a node.
 *
 * The stored quiz (atlas_rungs.quiz_json) carries the answers, so it never
 * leaves the server: the client gets questions and choices only, grading
 * happens here, and the `why` explanations are revealed only once all three
 * are right (a miss shows which were wrong, not the answer). Retry freely,
 * no cost; a pass is permanent — later re-takes are logged but change
 * nothing, because tiers derive from the existence of a pass_quiz event.
 */
import { z } from "zod";
import { QUIZ_QUESTIONS, QuizQuestionSchema, type QuizQuestion } from "./rungs";
import type { EventRow } from "./events";

const StoredQuizSchema = z.array(QuizQuestionSchema);

/** Parse quiz_json; a malformed or absent quiz is "no quiz", never a crash. */
export const parseQuizJson = (quizJson: string | null | undefined): QuizQuestion[] | null => {
  if (!quizJson) return null;
  try {
    const parsed = StoredQuizSchema.safeParse(JSON.parse(quizJson));
    return parsed.success && parsed.data.length === QUIZ_QUESTIONS ? parsed.data : null;
  } catch {
    return null;
  }
};

export type PublicQuizQuestion = { question: string; choices: string[] };

/** What the client may see before passing: no answer index, no why. */
export const publicQuiz = (quiz: readonly QuizQuestion[]): PublicQuizQuestion[] =>
  quiz.map((q) => ({ question: q.question, choices: [...q.choices] }));

export const AnswersSchema = z.object({
  answers: z.array(z.number().int().min(0).max(3)).length(QUIZ_QUESTIONS),
});

export type GradeResult = {
  correct: boolean[];
  score: number;
  passed: boolean;
  /** Per-question explanations, present only when passed. */
  explanations: string[] | null;
};

export const gradeQuiz = (quiz: readonly QuizQuestion[], answers: readonly number[]): GradeResult => {
  const correct = quiz.map((q, i) => answers[i] === q.answer);
  const score = correct.filter(Boolean).length;
  const passed = score === quiz.length;
  return { correct, score, passed, explanations: passed ? quiz.map((q) => q.why) : null };
};

export type QuizState = { passedAt: Date | null; attempts: number };

/** A player's standing on one node's quiz, from the event log. */
export const quizState = (
  events: readonly Pick<EventRow, "verb" | "nodeId" | "data" | "createdAt">[],
  nodeId: number,
): QuizState => {
  let passedAt: Date | null = null;
  let attempts = 0;
  for (const e of events) {
    if (e.nodeId !== nodeId) continue;
    if (e.verb === "pass_quiz") {
      attempts += 1;
      if (!passedAt || e.createdAt < passedAt) passedAt = e.createdAt;
    } else if (e.verb === "fail_quiz") {
      attempts += 1;
    }
  }
  return { passedAt, attempts };
};
