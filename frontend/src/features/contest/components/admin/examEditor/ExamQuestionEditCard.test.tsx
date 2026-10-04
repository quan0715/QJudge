import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState, type ReactNode } from "react";
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
    <div
      data-testid="markdown-preview"
      data-enable-math={enableMath ? "true" : "false"}
    >
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
    const explanation = previews.find(
      (node) => node.textContent === "$\\int_0^1 x\\,dx=\\frac12$",
    );
    expect(reference).toHaveAttribute("data-enable-math", "true");
    expect(explanation).toHaveAttribute("data-enable-math", "true");
    expect(screen.getByRole("region", { name: "題目" })).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "評分參考答案" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "詳解（解題過程）" }),
    ).toBeInTheDocument();
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
        answerCounts={{ total: 5, graded: 3 }}
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

  it("sends one auto-save request for one edit", async () => {
    vi.useFakeTimers();
    const onAutoSave = vi.fn(
      () => new Promise<void>((resolve) => setTimeout(resolve, 50)),
    );
    const Harness = () => {
      const [, setSaveCount] = useState(0);
      return (
        <ExamQuestionEditCard
          question={createQuestion()}
          index={0}
          onAutoSave={async (...args) => {
            setSaveCount((count) => count + 1);
            await onAutoSave(...args);
          }}
          onDelete={vi.fn()}
          onDuplicate={vi.fn()}
        />
      );
    };
    renderWithProviders(
      <Harness />,
    );

    fireEvent.click(screen.getByTestId("exam-card-q1"));
    fireEvent.change(screen.getByRole("spinbutton", { name: "分" }), {
      target: { value: "7" },
    });

    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1100); });

    expect(onAutoSave).toHaveBeenCalledTimes(1);
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
        answerCounts={{ total: 5, graded: 3 }}
        onAutoSave={onAutoSave}
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("exam-card-q1"));
    const reference = screen.getByRole("textbox", { name: "評分參考答案" });
    fireEvent.change(reference, { target: { value: "new rubric" } });
    fireEvent.click(screen.getByRole("button", { name: "儲存變更" }));
    expect(screen.getByRole("dialog").querySelector("strong")).toHaveTextContent("3");
    fireEvent.click(screen.getByRole("button", { name: "標記為待批改" }));

    await waitFor(() => expect(onAutoSave).toHaveBeenCalledTimes(1));
    expect(onAutoSave).toHaveBeenCalledWith(
      expect.objectContaining({ correct_answer: "new rubric" }),
      "q1",
      "mark_pending",
    );
  });

  it("lets a locked legacy answer be re-picked and regraded", async () => {
    const onAutoSave = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <ExamQuestionEditCard
        question={createQuestion({
          questionType: "true_false",
          options: ["True", "False"],
          correctAnswer: true,
        })}
        index={0}
        contentLocked
        answerCounts={{ total: 5, graded: 3 }}
        onAutoSave={onAutoSave}
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("exam-card-q1"));
    const trueOption = document.getElementById("edit-tf-q1-0") as HTMLInputElement;
    expect(trueOption.checked).toBe(false);
    fireEvent.click(trueOption);
    fireEvent.click(screen.getByRole("button", { name: "儲存變更" }));
    fireEvent.click(screen.getByRole("button", { name: "重新批改" }));

    await waitFor(() => expect(onAutoSave).toHaveBeenCalledTimes(1));
    expect(onAutoSave).toHaveBeenCalledWith(
      expect.objectContaining({ correct_answer: 0 }),
      "q1",
      "regrade",
    );
  });

  it("omits locked content fields from a locked grading save", async () => {
    const onAutoSave = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <ExamQuestionEditCard
        question={createQuestion({
          questionType: "true_false",
          options: [],
          correctAnswer: 0,
        })}
        index={0}
        contentLocked
        answerCounts={{ total: 5, graded: 3 }}
        onAutoSave={onAutoSave}
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("exam-card-q1"));
    fireEvent.change(screen.getByRole("spinbutton", { name: "分" }), {
      target: { value: "7" },
    });
    fireEvent.click(screen.getByRole("button", { name: "儲存變更" }));
    fireEvent.click(screen.getByRole("button", { name: "重新批改" }));

    await waitFor(() => expect(onAutoSave).toHaveBeenCalledTimes(1));
    const [payload, questionId, action] = onAutoSave.mock.calls[0];
    expect(questionId).toBe("q1");
    expect(action).toBe("regrade");
    expect(payload).toMatchObject({ score: 7, correct_answer: 0 });
    for (const field of ["question_type", "prompt", "options", "answer_format"]) {
      expect(payload).not.toHaveProperty(field);
    }
  });

  it.each([
    { questionType: "single_choice", key: 0, selected: [0] },
    { questionType: "single_choice", key: 1, selected: [1] },
    { questionType: "single_choice", key: -1, selected: [] },
    { questionType: "single_choice", key: 2, selected: [] },
    { questionType: "single_choice", key: 0.5, selected: [] },
    { questionType: "single_choice", key: "1", selected: [] },
    { questionType: "single_choice", key: "B", selected: [] },
    { questionType: "single_choice", key: "Option B", selected: [] },
    { questionType: "single_choice", key: true, selected: [] },
    { questionType: "true_false", key: 0, selected: [0] },
    { questionType: "true_false", key: 1, selected: [1] },
    { questionType: "true_false", key: 2, selected: [] },
    { questionType: "true_false", key: false, selected: [] },
    { questionType: "true_false", key: "true", selected: [] },
    { questionType: "multiple_choice", key: [0, 1], selected: [0, 1] },
    { questionType: "multiple_choice", key: [1, 0], selected: [0, 1] },
    { questionType: "multiple_choice", key: [0, 0], selected: [] },
    { questionType: "multiple_choice", key: [0, 2], selected: [] },
    { questionType: "multiple_choice", key: [0, -1], selected: [] },
    { questionType: "multiple_choice", key: [0, 0.5], selected: [] },
    { questionType: "multiple_choice", key: [0, "1"], selected: [] },
    { questionType: "multiple_choice", key: [false], selected: [] },
    { questionType: "multiple_choice", key: ["Option B"], selected: [] },
  ] as const)("uses the same canonical key in preview and editor: $questionType $key", ({ questionType, key, selected }) => {
    renderWithProviders(
      <ExamQuestionEditCard
        question={createQuestion({ questionType, options: ["Option A", "Option B"], correctAnswer: key })}
        index={0}
        contentLocked
        onAutoSave={vi.fn()}
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
      />,
    );
    if (questionType === "true_false") {
      // True/false preview uses answer badges rather than inputs.
      expect(screen.getAllByText("正確答案")).toHaveLength(selected.length + 1);
    } else {
      const prefix = questionType === "multiple_choice" ? "mc" : "opt";
      for (const index of [0, 1]) {
        expect((document.getElementById(`pv-q1-${prefix}-${index}`) as HTMLInputElement).checked)
          .toBe(selected.some((value) => value === index));
      }
    }
    fireEvent.click(screen.getByTestId("exam-card-q1"));
    const prefix = questionType === "multiple_choice" ? "mc" : questionType === "true_false" ? "tf" : "sc";
    for (const index of [0, 1]) {
      expect((document.getElementById(`edit-${prefix}-q1-${index}`) as HTMLInputElement).checked)
        .toBe(selected.some((value) => value === index));
    }
  });

  it.each(["B", "Option B", "1", true])("reselects a legacy single-choice key %j before saving", async (correctAnswer) => {
    const onAutoSave = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <ExamQuestionEditCard
        question={createQuestion({ options: ["Option A", "Option B"], correctAnswer })}
        index={0}
        contentLocked
        answerCounts={{ total: 5, graded: 3 }}
        onAutoSave={onAutoSave}
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("exam-card-q1"));
    fireEvent.click(document.getElementById("edit-sc-q1-1")!);
    fireEvent.click(screen.getByRole("button", { name: "儲存變更" }));
    fireEvent.click(screen.getByRole("button", { name: "重新批改" }));
    await waitFor(() => expect(onAutoSave).toHaveBeenCalledWith(
      expect.objectContaining({ correct_answer: 1 }), "q1", "regrade",
    ));
  });

  it("allows reselecting a duplicate key and saves unique integer indexes", async () => {
    const onAutoSave = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <ExamQuestionEditCard
        question={createQuestion({ questionType: "multiple_choice", correctAnswer: [0, 0] })}
        index={0}
        contentLocked
        answerCounts={{ total: 5, graded: 3 }}
        onAutoSave={onAutoSave}
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("exam-card-q1"));
    fireEvent.click(document.getElementById("edit-mc-q1-0")!);
    fireEvent.click(screen.getByRole("button", { name: "儲存變更" }));
    fireEvent.click(screen.getByRole("button", { name: "重新批改" }));
    await waitFor(() => expect(onAutoSave).toHaveBeenCalledWith(
      expect.objectContaining({ correct_answer: [0] }), "q1", "regrade",
    ));
  });

  it("keeps an open dialog current and blocks unknown impact until a successful retry", async () => {
    const onAutoSave = vi.fn().mockResolvedValue(undefined);
    const onRefreshImpact = vi.fn();
    const props = {
      question: createQuestion(), index: 0, contentLocked: true,
      onAutoSave, onDelete: vi.fn(), onDuplicate: vi.fn(), onRefreshImpact,
    };
    const view = renderWithProviders(<ExamQuestionEditCard {...props} impactStatus="loading" />);
    fireEvent.click(screen.getByTestId("exam-card-q1"));
    fireEvent.click(document.getElementById("edit-sc-q1-0")!);
    fireEvent.click(screen.getByRole("button", { name: "儲存變更" }));
    expect(onRefreshImpact).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "重新批改" })).toBeDisabled();
    expect(screen.getByRole("dialog").querySelector("strong")).toBeNull();
    view.rerender(<ThemeProvider><ExamQuestionEditCard {...props} impactStatus="error" /></ThemeProvider>);
    expect(screen.getByRole("button", { name: "重新批改" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "重試" }));
    expect(onRefreshImpact).toHaveBeenCalledTimes(2);
    view.rerender(<ThemeProvider><ExamQuestionEditCard {...props} impactStatus="loaded" answerCounts={{total: 8, graded: 3}} /></ThemeProvider>);
    expect(screen.getByRole("dialog").querySelector("strong")).toHaveTextContent("8");
    expect(screen.getByRole("button", { name: "重新批改" })).toBeEnabled();
    view.rerender(<ThemeProvider><ExamQuestionEditCard {...props} impactStatus="loaded" answerCounts={{total: 9, graded: 4}} /></ThemeProvider>);
    expect(screen.getByRole("dialog").querySelector("strong")).toHaveTextContent("9");
    fireEvent.click(screen.getByRole("button", { name: "重新批改" }));
    await waitFor(() => expect(onAutoSave).toHaveBeenCalledOnce());
  });


  it("gates policy previews until impact is loaded and resets the menu when counts refresh", () => {
    const onRefreshImpact = vi.fn();
    const props = {
      question: createQuestion(), index: 0, contentLocked: true,
      onAutoSave: vi.fn(), onDelete: vi.fn(), onDuplicate: vi.fn(), onRefreshImpact,
    };
    const view = renderWithProviders(<ExamQuestionEditCard {...props} impactStatus="loading" />);
    expect(screen.queryByRole("button", { name: "分數政策" })).not.toBeInTheDocument();
    view.rerender(<ThemeProvider><ExamQuestionEditCard {...props} impactStatus="error" /></ThemeProvider>);
    expect(screen.queryByRole("button", { name: "分數政策" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重試" }));
    expect(onRefreshImpact).toHaveBeenCalledOnce();
    view.rerender(<ThemeProvider><ExamQuestionEditCard {...props} impactStatus="loaded" /></ThemeProvider>);
    fireEvent.click(screen.getByRole("button", { name: "分數政策" }));
    expect(screen.getByRole("button", { name: "分數政策" })).toHaveAttribute("aria-expanded", "true");
    view.rerender(<ThemeProvider><ExamQuestionEditCard {...props} impactStatus="loading" /></ThemeProvider>);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "分數政策" })).not.toBeInTheDocument();
    view.rerender(<ThemeProvider><ExamQuestionEditCard {...props} impactStatus="loaded" /></ThemeProvider>);
    expect(screen.getByRole("button", { name: "分數政策" })).toHaveAttribute("aria-expanded", "false");
  });

});
