import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import GradingSplitPanelScreen from "./GradingSplitPanelScreen";
import type { GradingAnswerRow } from "./gradingTypes";

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

vi.mock("@/shared/ui/markdown/MarkdownContent", () => ({
  default: {
    Problem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  },
}));

vi.mock("@/features/contest/components/exam/AnswerDisplay", () => ({
  default: () => <div>answer-display</div>,
}));

const answer: GradingAnswerRow = {
  id: "a-1",
  studentId: "s-1",
  studentUsername: "student1",
  studentNickname: "Student One",
  questionId: "q-1",
  questionIndex: 1,
  questionPrompt: "Question prompt",
  questionType: "short_answer",
  questionOptions: [],
  maxScore: 10,
  answerContent: {},
  score: 3,
  feedback: "",
  gradedBy: null,
  gradedAt: null,
  isAutoGraded: false,
  correctAnswer: null,
};

describe("GradingSplitPanelScreen", () => {
  it("grades and advances without switching button label to saved in save-next flow", () => {
    const onGrade = vi.fn();
    const onNextStudent = vi.fn();

    render(
      <GradingSplitPanelScreen
        answer={answer}
        onGrade={onGrade}
        flowMode="byQuestion"
        onNextStudent={onNextStudent}
        hasNextStudent
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "儲存並下一位學生" }));

    expect(onGrade).toHaveBeenCalledWith("a-1", 3, "");
    expect(onNextStudent).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "已儲存" })).not.toBeInTheDocument();
  });
});
