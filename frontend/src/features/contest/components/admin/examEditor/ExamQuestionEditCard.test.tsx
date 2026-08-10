import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

vi.mock("@/shared/ui/markdown/markdownEditor", () => ({
  MarkdownField: ({
    id,
    labelText,
    value,
    onChange,
    disabled,
  }: {
    id?: string;
    labelText?: string;
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
  }) => (
    <textarea
      id={id}
      aria-label={labelText}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />
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
  afterEach(() => {
    vi.useRealTimers();
  });

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

  it("does not auto-save a locked grading edit", async () => {
    vi.useFakeTimers();
    const onAutoSave = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <ExamQuestionEditCard
        question={createQuestion({
          questionType: "essay",
          options: [],
          correctAnswer: "old rubric",
        })}
        index={0}
        contentLocked
        gradedAnswerCount={3}
        onAutoSave={onAutoSave}
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("exam-card-q1"));
    const reference = screen.getByRole("textbox", { name: "評分參考答案" });
    fireEvent.change(reference, { target: { value: "new rubric" } });
    await vi.advanceTimersByTimeAsync(1500);
    fireEvent.blur(reference);

    expect(onAutoSave).not.toHaveBeenCalled();
    expect(screen.getByText("尚未儲存")).toBeInTheDocument();
  });

  it("sends mark_pending only after explicit confirmation", async () => {
    const onAutoSave = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <ExamQuestionEditCard
        question={createQuestion({
          questionType: "essay",
          options: [],
          correctAnswer: "old rubric",
        })}
        index={0}
        contentLocked
        gradedAnswerCount={3}
        onAutoSave={onAutoSave}
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("exam-card-q1"));
    const reference = screen.getByRole("textbox", { name: "評分參考答案" });
    fireEvent.change(reference, { target: { value: "new rubric" } });
    fireEvent.click(screen.getByRole("button", { name: "儲存變更" }));
    fireEvent.click(screen.getByRole("button", { name: "標記為待批改" }));

    await waitFor(() => expect(onAutoSave).toHaveBeenCalledTimes(1));
    expect(onAutoSave).toHaveBeenCalledWith(
      expect.objectContaining({ correct_answer: "new rubric" }),
      "q1",
      "mark_pending",
    );
  });
});
