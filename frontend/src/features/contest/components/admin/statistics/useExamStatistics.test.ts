import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useExamStatistics } from "./useExamStatistics";
import { useGradingData } from "@/features/contest/screens/settings/grading/useGradingData";
import type {
  GradingAnswerRow,
  QuestionProgress,
} from "@/features/contest/screens/settings/grading/gradingTypes";

vi.mock("@/features/contest/screens/settings/grading/useGradingData", () => ({
  useGradingData: vi.fn(),
}));

const mockedUseGradingData = vi.mocked(useGradingData);

function buildAnswerRow(partial: Partial<GradingAnswerRow> = {}): GradingAnswerRow {
  return {
    id: partial.id ?? "a-1",
    studentId: partial.studentId ?? "u-1",
    studentUsername: partial.studentUsername ?? "student",
    studentNickname: partial.studentNickname ?? "Student",
    questionId: partial.questionId ?? "q-1",
    questionIndex: partial.questionIndex ?? 1,
    questionPrompt: partial.questionPrompt ?? "Question 1",
    questionType: partial.questionType ?? "single_choice",
    questionOptions: partial.questionOptions ?? ["A", "B"],
    maxScore: partial.maxScore ?? 2,
    answerContent: partial.answerContent ?? { selected: 0 },
    score: partial.score ?? 0,
    feedback: partial.feedback ?? "",
    gradedBy: partial.gradedBy ?? null,
    gradedAt: partial.gradedAt ?? null,
    isAutoGraded: partial.isAutoGraded ?? true,
    correctAnswer: partial.correctAnswer ?? 1,
    isAbsent: partial.isAbsent,
  };
}

function buildQuestionProgress(
  partial: Partial<QuestionProgress> = {},
): QuestionProgress {
  return {
    questionId: partial.questionId ?? "q-1",
    questionIndex: partial.questionIndex ?? 1,
    questionType: partial.questionType ?? "single_choice",
    prompt: partial.prompt ?? "Question 1",
    maxScore: partial.maxScore ?? 2,
    totalAnswers: partial.totalAnswers ?? 2,
    gradedCount: partial.gradedCount ?? 2,
    progressPercent: partial.progressPercent ?? 100,
    isObjective: partial.isObjective ?? true,
  };
}

describe("useExamStatistics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("counts scalar selected indexes for single-choice answers", () => {
    const answers = [
      buildAnswerRow({
        id: "a-1",
        answerContent: { selected: 0 },
        questionOptions: ["Opt A", "Opt B"],
        correctAnswer: 1,
      }),
      buildAnswerRow({
        id: "a-2",
        answerContent: { selected: 1 },
        questionOptions: ["Opt A", "Opt B"],
        correctAnswer: 1,
      }),
    ];

    mockedUseGradingData.mockReturnValue({
      answersByQuestion: new Map([["q-1", answers]]),
      questionProgress: [buildQuestionProgress()],
      loading: false,
    } as any);

    const { result } = renderHook(() => useExamStatistics());
    const distribution = result.current.questionStats[0].optionDistribution;

    expect(distribution).toHaveLength(2);
    expect(distribution[0]).toMatchObject({ count: 1, percent: 50, isCorrect: false });
    expect(distribution[1]).toMatchObject({ count: 1, percent: 50, isCorrect: true });
  });

  it("maps true/false boolean values to correct option indexes", () => {
    const answers = [
      buildAnswerRow({
        id: "a-1",
        questionType: "true_false",
        answerContent: { selected: true },
        questionOptions: ["True", "False"],
        correctAnswer: true,
      }),
      buildAnswerRow({
        id: "a-2",
        questionType: "true_false",
        answerContent: { selected: false },
        questionOptions: ["True", "False"],
        correctAnswer: true,
      }),
    ];

    mockedUseGradingData.mockReturnValue({
      answersByQuestion: new Map([["q-1", answers]]),
      questionProgress: [
        buildQuestionProgress({
          questionType: "true_false",
        }),
      ],
      loading: false,
    } as any);

    const { result } = renderHook(() => useExamStatistics());
    const distribution = result.current.questionStats[0].optionDistribution;

    expect(distribution).toHaveLength(2);
    expect(distribution[0]).toMatchObject({ count: 1, percent: 50, isCorrect: true });
    expect(distribution[1]).toMatchObject({ count: 1, percent: 50, isCorrect: false });
  });
});

