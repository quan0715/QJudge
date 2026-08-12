import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import QuestionSidebarScreen from "./QuestionSidebarScreen";
import type { QuestionProgress } from "./gradingTypes";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (
      key: string,
      fallbackOrParams?: string | Record<string, unknown>,
      maybeParams?: Record<string, unknown>,
    ) => {
      const fallback = typeof fallbackOrParams === "string" ? fallbackOrParams : key;
      const params =
        typeof fallbackOrParams === "string" ? maybeParams : fallbackOrParams;
      if (!params) {
        return fallback;
      }
      return Object.entries(params).reduce(
        (acc, [paramKey, value]) => acc.replace(`{{${paramKey}}}`, String(value)),
        fallback,
      );
    },
  }),
}));

describe("QuestionSidebarScreen", () => {
  it("shows partial progress as quiet count text", () => {
    const questions: QuestionProgress[] = [
      {
        questionId: "q-1",
        questionIndex: 1,
        questionType: "short_answer",
        prompt: "Q1",
        maxScore: 10,
        totalAnswers: 4,
        gradedCount: 2,
        progressPercent: 50,
        isObjective: false,
      },
    ];

    render(
      <QuestionSidebarScreen
        questions={questions}
        selectedQuestionId="q-1"
        onSelect={vi.fn()}
      />,
    );

    const progress = screen.getByLabelText("已批改 2，共 4 份");
    expect(progress).toHaveTextContent("2/4");
  });

  it("compresses completed progress into a labelled checkmark", () => {
    const questions: QuestionProgress[] = [
      {
        questionId: "q-1",
        questionIndex: 1,
        questionType: "short_answer",
        prompt: "Q1",
        maxScore: 10,
        totalAnswers: 4,
        gradedCount: 4,
        progressPercent: 100,
        isObjective: false,
      },
    ];

    render(
      <QuestionSidebarScreen
        questions={questions}
        selectedQuestionId="q-1"
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("4/4 完成")).toBeInTheDocument();
  });

  it("shows a question type icon on every row, including adjacent questions of the same type", () => {
    const baseQuestion: QuestionProgress = {
      questionId: "q-1",
      questionIndex: 1,
      questionType: "short_answer",
      prompt: "Q1",
      maxScore: 2,
      totalAnswers: 1,
      gradedCount: 1,
      progressPercent: 100,
      isObjective: false,
    };

    render(
      <QuestionSidebarScreen
        questions={[
          baseQuestion,
          { ...baseQuestion, questionId: "q-2", questionIndex: 2, prompt: "Q2" },
        ]}
        selectedQuestionId="q-1"
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getAllByTestId("question-type-marker")).toHaveLength(2);
  });
});
