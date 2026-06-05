import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { ExamQuestion } from "@/core/entities/contest.entity";
import { ThemeProvider } from "@/shared/ui/theme/ThemeContext";

import ExamQuestionEditCard from "./ExamQuestionEditCard";

vi.mock("@/shared/contexts", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock("@/shared/ui/markdown/MarkdownRenderer", () => ({
  default: ({
    children,
    enableMath,
  }: {
    children: ReactNode;
    enableMath?: boolean;
  }) => (
    <div data-testid="markdown-preview" data-enable-math={enableMath ? "true" : "false"}>
      {children}
    </div>
  ),
}));

const createQuestion = (partial: Partial<ExamQuestion> = {}): ExamQuestion => ({
  id: "q1",
  contestId: "contest-1",
  questionType: "single_choice",
  prompt: "坐標平面上，$y=\\sin x$。",
  options: ["$\\frac{\\pi}{5}$", "$\\frac{2\\pi}{5}$"],
  correctAnswer: 1,
  explanation: "",
  score: 6,
  order: 1,
  groupId: null,
  orderInGroup: null,
  answerFormat: "plain_text",
  createdAt: "",
  updatedAt: "",
  ...partial,
});

const renderWithProviders = (ui: ReactNode) =>
  render(<ThemeProvider>{ui}</ThemeProvider>);

describe("ExamQuestionEditCard", () => {
  it("renders choice preview options through markdown math renderer", () => {
    renderWithProviders(
      <ExamQuestionEditCard
        question={createQuestion()}
        index={0}
        onAutoSave={vi.fn()}
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
      />,
    );

    const optionPreview = screen
      .getAllByTestId("markdown-preview")
      .find((node) => node.textContent === "$\\frac{\\pi}{5}$");
    expect(optionPreview).toBeInTheDocument();
    expect(optionPreview).toHaveAttribute("data-enable-math", "true");
  });

  it("renders subjective reference answer and explanation through markdown math renderer", () => {
    renderWithProviders(
      <ExamQuestionEditCard
        question={createQuestion({
          questionType: "essay",
          options: [],
          correctAnswer: "$x=1$",
          explanation: "$\\int_0^1 x\\,dx=\\frac12$",
          answerFormat: "markdown_math",
        })}
        index={0}
        onAutoSave={vi.fn()}
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
      />,
    );

    const previews = screen.getAllByTestId("markdown-preview");
    const reference = previews.find((node) => node.textContent === "$x=1$");
    const explanation = previews.find((node) => node.textContent === "$\\int_0^1 x\\,dx=\\frac12$");
    expect(reference).toHaveAttribute("data-enable-math", "true");
    expect(explanation).toHaveAttribute("data-enable-math", "true");
    expect(screen.getByText("評分參考答案")).toBeInTheDocument();
    expect(screen.getByText("詳解（解題過程）")).toBeInTheDocument();
  });
});
