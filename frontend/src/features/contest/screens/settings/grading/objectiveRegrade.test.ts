import { describe, expect, it } from "vitest";
import { calculateObjectiveExpectedScore } from "./objectiveRegrade";
import type { GradingAnswerRow } from "./gradingTypes";

const buildRow = (partial: Partial<GradingAnswerRow>): GradingAnswerRow => ({
  id: partial.id ?? "a1",
  studentId: partial.studentId ?? "u1",
  studentUsername: partial.studentUsername ?? "student",
  studentNickname: partial.studentNickname ?? "student",
  questionId: partial.questionId ?? "q1",
  questionIndex: partial.questionIndex ?? 1,
  questionPrompt: partial.questionPrompt ?? "prompt",
  questionType: partial.questionType ?? "single_choice",
  questionOptions: partial.questionOptions ?? ["A", "B", "C"],
  maxScore: partial.maxScore ?? 5,
  answerContent: partial.answerContent ?? { selected: 1 },
  score: partial.score ?? null,
  feedback: partial.feedback ?? "",
  gradedBy: partial.gradedBy ?? null,
  gradedAt: partial.gradedAt ?? null,
  isAutoGraded: partial.isAutoGraded ?? false,
  correctAnswer: partial.correctAnswer ?? 1,
});

describe("calculateObjectiveExpectedScore", () => {
  it("returns full score for single choice index match", () => {
    const row = buildRow({
      questionType: "single_choice",
      answerContent: { selected: 1 },
      correctAnswer: 1,
      maxScore: 8,
    });
    expect(calculateObjectiveExpectedScore(row)).toBe(8);
  });

  it("supports legacy letter-style single choice answer", () => {
    const row = buildRow({
      questionType: "single_choice",
      questionOptions: ["Alpha", "Beta", "Gamma"],
      answerContent: { selected: 1 },
      correctAnswer: "B",
      maxScore: 6,
    });
    expect(calculateObjectiveExpectedScore(row)).toBe(6);
  });

  it("supports true_false bool/string/index normalization", () => {
    const row = buildRow({
      questionType: "true_false",
      answerContent: { selected: 0 },
      correctAnswer: "true",
      maxScore: 3,
    });
    expect(calculateObjectiveExpectedScore(row)).toBe(3);
  });

  it("compares multiple choice as set equality", () => {
    const row = buildRow({
      questionType: "multiple_choice",
      questionOptions: ["X", "Y", "Z"],
      answerContent: { selected: [2, 0] },
      correctAnswer: [0, 2],
      maxScore: 10,
    });
    expect(calculateObjectiveExpectedScore(row)).toBe(10);
  });

  it("returns null for subjective question types", () => {
    const row = buildRow({
      questionType: "essay",
      answerContent: { text: "answer" },
      correctAnswer: "reference",
    });
    expect(calculateObjectiveExpectedScore(row)).toBeNull();
  });
});

