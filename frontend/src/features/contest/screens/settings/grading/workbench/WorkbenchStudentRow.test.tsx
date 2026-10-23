import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ExamQuestion } from "@/core/entities/contest.entity";
import type { GradingAnswerRow } from "../gradingTypes";
import type { WorkbenchStudentRow as Row } from "./workbenchRowModel";
import { WorkbenchScoreField } from "./WorkbenchScoreField";
import { WorkbenchStudentRow } from "./WorkbenchStudentRow";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: unknown, options?: Record<string, unknown>) => {
      const text = typeof fallback === "string" ? fallback : key;
      const values = (typeof fallback === "object" ? fallback : options) as Record<string, unknown> | undefined;
      return text.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(values?.[name] ?? ""));
    },
  }),
}));
vi.mock("@/features/contest/components/exam/AnswerDisplay", () => ({
  default: () => <div>student answer</div>,
}));

const answer = (over: Partial<GradingAnswerRow>): GradingAnswerRow =>
  ({
    id: "a1",
    studentId: "s1",
    studentUsername: "preview_01",
    studentDisplayName: "模擬學生 01",
    questionId: "q1",
    questionIndex: 3,
    questionType: "short_answer",
    questionOptions: [],
    maxScore: 17,
    answerContent: {},
    score: 12,
    feedback: "舊評語",
    isAutoGraded: false,
    correctAnswer: null,
    ...over,
  }) as GradingAnswerRow;

const question = (over: Partial<ExamQuestion> = {}) => ({ id: "q1", score: 17, questionType: "short_answer", options: [], ...over }) as ExamQuestion;

const studentRow = (answers: GradingAnswerRow[], over: Partial<Row> = {}): Row => ({
  studentId: "s1",
  name: "模擬學生 01",
  username: "preview_01",
  answers,
  total: answers.every((a) => a.score !== null) ? answers.reduce((n, a) => n + (a.score ?? 0), 0) : null,
  source: "manual",
  ...over,
});

const baseProps = {
  labels: new Map([["q1", { label: "3" }]]),
  maxScore: 17,
  drafts: {},
  suggestionScores: {},
  busy: false,
  onToggle: vi.fn(),
  onDraftChange: vi.fn(),
  onPrimary: vi.fn(),
  onSecondary: vi.fn(),
};

describe("WorkbenchScoreField", () => {
  it("steps and clamps", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <WorkbenchScoreField label="分數" max={3} step={0.5} value={2.5} aiValue={null} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "分數 加 0.5 分" }));
    expect(onChange).toHaveBeenLastCalledWith(3);
    rerender(<WorkbenchScoreField label="分數" max={3} step={0.5} value={3} aiValue={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "分數 加 0.5 分" }));
    expect(onChange).toHaveBeenLastCalledWith(3);
    fireEvent.click(screen.getByRole("button", { name: "分數 減 0.5 分" }));
    expect(onChange).toHaveBeenLastCalledWith(2.5);
  });

  it("accepts two decimals", () => {
    const onChange = vi.fn();
    render(<WorkbenchScoreField label="分數" max={3} step={0.5} value={null} aiValue={null} onChange={onChange} />);
    const input = screen.getByRole("textbox", { name: "分數" });
    fireEvent.change(input, { target: { value: "2.75" } });
    expect(onChange).toHaveBeenLastCalledWith(2.75);
    onChange.mockClear();
    fireEvent.change(input, { target: { value: "9" } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("restore appears only when differs from AI", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <WorkbenchScoreField label="分數" max={17} step={0.5} value={12} aiValue={12} onChange={onChange} />,
    );
    expect(screen.queryByRole("button", { name: /還原 AI/ })).toBeNull();
    rerender(<WorkbenchScoreField label="分數" max={17} step={0.5} value={10} aiValue={12} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "還原 AI 的 12 分" }));
    expect(onChange).toHaveBeenLastCalledWith(12);
  });
});

describe("WorkbenchStudentRow", () => {
  it("collapsed row shows suggestion as current → suggested", () => {
    render(
      <WorkbenchStudentRow
        {...baseProps}
        row={studentRow([answer({})], { source: "suggestion" })}
        questions={[question()]}
        expanded={false}
        suggestionScores={{ a1: { score: 13, feedback: "新評語" } }}
      />,
    );
    expect(screen.getByText("12 → 13")).toBeTruthy();
    expect(screen.getByText("建議")).toBeTruthy();
    expect(screen.getByText("新評語")).toBeTruthy();
  });

  it("pending row uses adopt/skip buttons", () => {
    const onPrimary = vi.fn();
    const onSecondary = vi.fn();
    render(
      <WorkbenchStudentRow
        {...baseProps}
        row={studentRow([answer({})], { source: "suggestion" })}
        questions={[question()]}
        expanded
        suggestionScores={{ a1: { score: 13, feedback: "新評語" } }}
        onPrimary={onPrimary}
        onSecondary={onSecondary}
      />,
    );
    expect(screen.getByText("目前成績 12 分")).toBeTruthy();
    expect((screen.getByRole("textbox", { name: "分數" }) as HTMLInputElement).value).toBe("13");
    fireEvent.click(screen.getByRole("button", { name: "採用並下一位" }));
    fireEvent.click(screen.getByRole("button", { name: "略過建議" }));
    expect(onPrimary).toHaveBeenCalledTimes(1);
    expect(onSecondary).toHaveBeenCalledTimes(1);
  });

  it("editing a score reports a draft", () => {
    const onDraftChange = vi.fn();
    render(
      <WorkbenchStudentRow
        {...baseProps}
        row={studentRow([answer({})])}
        questions={[question()]}
        expanded
        onDraftChange={onDraftChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "分數 加 0.5 分" }));
    expect(onDraftChange).toHaveBeenLastCalledWith("a1", { score: 12.5, feedback: "舊評語" });
    expect(screen.getByRole("button", { name: "儲存並下一位" })).toBeTruthy();
  });

  it("objective row marks picked and correct options", () => {
    const choice = answer({
      questionType: "single_choice",
      questionOptions: ["Pass", "Good", "Fail"],
      correctAnswer: 2,
      answerContent: { selected: 1 },
      score: 0,
      isAutoGraded: true,
      maxScore: 4,
    });
    render(
      <WorkbenchStudentRow
        {...baseProps}
        maxScore={4}
        row={studentRow([choice], { source: "auto" })}
        questions={[question({ questionType: "single_choice", score: 4 })]}
        expanded
      />,
    );
    expect(screen.getByText((_, node) => node?.textContent === "選 B　Good")).toBeTruthy();
    expect(screen.getByText("學生選擇")).toBeTruthy();
    expect(screen.getByText("正解")).toBeTruthy();
    expect(screen.getByRole("button", { name: "分數 加 1 分" })).toBeTruthy();
  });
});
