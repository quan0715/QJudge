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
  it("renders question progress as a circular percentage indicator", () => {
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

    expect(screen.getByTitle("50% (2/4)")).toBeInTheDocument();
  });
});
