import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { ExamQuestion } from "@/core/entities/contest.entity";

import { ExamQuestionCard } from "./ExamQuestionCard";

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

const createQuestion = (
  answerFormat: ExamQuestion["answerFormat"],
  partial: Partial<ExamQuestion> = {},
): ExamQuestion => ({
  id: "q1",
  contestId: "contest-1",
  questionType: "essay",
  prompt: "Explain",
  options: [],
  explanation: "",
  score: 10,
  order: 1,
  groupId: null,
  orderInGroup: null,
  answerFormat,
  createdAt: "",
  updatedAt: "",
  ...partial,
});

describe("ExamQuestionCard", () => {
  it("renders markdown answers with preview but without math toolbar", () => {
    render(
      <ExamQuestionCard
        question={createQuestion("markdown")}
        index={0}
        answer="**answer**"
      />,
    );

    expect(screen.getByText("預覽")).toBeInTheDocument();
    expect(screen.getAllByTestId("markdown-preview").at(-1)).toHaveTextContent("**answer**");
    expect(screen.queryByRole("button", { name: "分式" })).not.toBeInTheDocument();
  });

  it("renders choice options through markdown math renderer", () => {
    render(
      <ExamQuestionCard
        question={createQuestion("plain_text", {
          questionType: "single_choice",
          options: ["$\\frac{\\pi}{5}$", "$\\frac{2\\pi}{5}$"],
          correctAnswer: 1,
        })}
        index={0}
      />,
    );

    const optionPreview = screen
      .getAllByTestId("markdown-preview")
      .find((node) => node.textContent === "$\\frac{\\pi}{5}$");
    expect(optionPreview).toBeInTheDocument();
    expect(optionPreview).toHaveAttribute("data-enable-math", "true");
  });

  it("renders open document answers without exposing markdown editing", () => {
    const onAnswerChange = vi.fn();
    const { container } = render(
      <ExamQuestionCard
        question={createQuestion("open_document")}
        index={0}
        onAnswerChange={onAnswerChange}
      />,
    );

    expect(screen.getByTestId("exam-answer-input-q1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /插入公式/ })).toBeInTheDocument();
    expect(screen.queryByText("預覽")).not.toBeInTheDocument();
    expect(container.querySelector("textarea")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /插入公式/ }));

    expect(screen.getByRole("dialog", { name: "插入公式" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "分式" })).toBeInTheDocument();
    expect(screen.queryByText(/LaTeX/i)).not.toBeInTheDocument();
  });
});
