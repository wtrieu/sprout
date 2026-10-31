import { describe, expect, it } from "vitest";
import type { QuizQuestion } from "./rungs";
import { gradeQuiz, parseQuizJson, publicQuiz, quizState } from "./quiz";

const QUIZ: QuizQuestion[] = [
  { question: "Q1 is what?", choices: ["a", "b", "c", "d"], answer: 0, why: "Because a." },
  { question: "Q2 is what?", choices: ["a", "b", "c", "d"], answer: 1, why: "Because b." },
  { question: "Q3 is what?", choices: ["a", "b", "c", "d"], answer: 2, why: "Because c." },
];

describe("parseQuizJson", () => {
  it("round-trips a stored quiz and treats junk as no quiz", () => {
    expect(parseQuizJson(JSON.stringify(QUIZ))).toEqual(QUIZ);
    expect(parseQuizJson(null)).toBeNull();
    expect(parseQuizJson("not json")).toBeNull();
    expect(parseQuizJson(JSON.stringify(QUIZ.slice(0, 2)))).toBeNull();
  });
});

describe("publicQuiz", () => {
  it("never ships the answer index or the explanation", () => {
    const pub = publicQuiz(QUIZ);
    expect(pub).toHaveLength(3);
    for (const q of pub) {
      expect(Object.keys(q).sort()).toEqual(["choices", "question"]);
    }
  });
});

describe("gradeQuiz", () => {
  it("passes only on all correct, and only then reveals the whys", () => {
    const miss = gradeQuiz(QUIZ, [0, 1, 3]);
    expect(miss).toEqual({ correct: [true, true, false], score: 2, passed: false, explanations: null });
    const pass = gradeQuiz(QUIZ, [0, 1, 2]);
    expect(pass.passed).toBe(true);
    expect(pass.explanations).toEqual(["Because a.", "Because b.", "Because c."]);
  });
});

describe("quizState", () => {
  it("keeps the first pass and counts every attempt", () => {
    const at = (s: string) => new Date(s);
    const events = [
      { verb: "fail_quiz", nodeId: 7, data: null, createdAt: at("2026-10-01") },
      { verb: "pass_quiz", nodeId: 7, data: null, createdAt: at("2026-10-02") },
      { verb: "pass_quiz", nodeId: 7, data: null, createdAt: at("2026-10-03") },
      { verb: "pass_quiz", nodeId: 8, data: null, createdAt: at("2026-10-04") },
      { verb: "open_node", nodeId: 7, data: null, createdAt: at("2026-10-05") },
    ];
    expect(quizState(events, 7)).toEqual({ passedAt: at("2026-10-02"), attempts: 3 });
    expect(quizState(events, 9)).toEqual({ passedAt: null, attempts: 0 });
  });
});
