import { fireEvent, render, screen, within } from "@testing-library/react";
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

  it("an ungraded row shows AI grading while the AI runs", () => {
    render(
      <WorkbenchStudentRow
        {...baseProps}
        row={studentRow([answer({ score: null, feedback: "" })], { source: "none" })}
        questions={[question()]}
        expanded={false}
        aiRunning
      />,
    );
    expect(screen.getAllByText("AI 批改中").length).toBeGreaterThan(0);
    expect(screen.queryByText("未批改")).toBeNull();
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

  it("mixed group renders each child by its own type", () => {
    const pick = answer({
      id: "m1",
      questionId: "q1",
      questionType: "single_choice",
      questionOptions: ["Yes", "No"],
      correctAnswer: 0,
      answerContent: { selected: 0 },
      score: 2,
      maxScore: 2,
      isAutoGraded: true,
    });
    const essay = answer({ id: "m2", questionId: "q2", score: null, feedback: "", maxScore: 5 });
    render(
      <WorkbenchStudentRow
        {...baseProps}
        labels={new Map([["q1", { label: "1(a)" }], ["q2", { label: "1(b)" }]])}
        maxScore={7}
        row={studentRow([pick, essay], { source: "none" })}
        questions={[question({ id: "q1", questionType: "single_choice", score: 2 }), question({ id: "q2", score: 5 })]}
        expanded
      />,
    );
    const partB = within(screen.getByRole("region", { name: "1(b)" }));
    expect(partB.getByText("student answer")).toBeTruthy();
    expect(partB.getByRole("button", { name: "1(b) 加 0.5 分" })).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "1(a)" })).getByRole("button", { name: "1(a) 加 1 分" })).toBeTruthy();
  });
});

it("shows an unanswered group child as zero without a score field", () => {
  render(
    <WorkbenchStudentRow
      {...baseProps}
      labels={new Map([["q1", { label: "14(a)" }], ["q2", { label: "14(b)" }]])}
      maxScore={15}
      row={studentRow([answer({ score: 1, feedback: "部分正確" })])}
      questions={[question({ score: 5 }), question({ id: "q2", score: 10 })]}
      expanded
    />,
  );
  expect(screen.getByRole("button", { expanded: true }).textContent).toContain("14(a) 部分正確\u300014(b) 未作答");
  const partB = within(screen.getByRole("region", { name: "14(b)" }));
  expect(partB.getByText("未作答，以 0 分計")).toBeInTheDocument();
  expect(partB.queryByRole("textbox")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "14(a) 加 0.5 分" })).toBeInTheDocument();
});

it("shows a student who answered nothing as unanswered with zero", () => {
  render(
    <WorkbenchStudentRow
      {...baseProps}
      row={studentRow([], { source: "unanswered", total: 0 })}
      questions={[question({ score: 5 })]}
      maxScore={5}
      expanded
    />,
  );
  const header = screen.getByRole("button", { expanded: true });
  expect(header.textContent).toContain("0 / 5");
  expect(within(header).getAllByText("未作答")).toHaveLength(2);
  expect(screen.getByText("未作答，以 0 分計")).toBeInTheDocument();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
});

it("shows full marks for an unanswered child of a full-marks question", () => {
  render(
    <WorkbenchStudentRow
      {...baseProps}
      labels={new Map([["q1", { label: "2(a)" }], ["q2", { label: "2(b)" }]])}
      maxScore={10}
      row={studentRow([answer({ score: 3, maxScore: 5 })])}
      questions={[question({ score: 5 }), question({ id: "q2", score: 5, scorePolicy: "full_marks" })]}
      expanded
    />,
  );
  const partB = within(screen.getByRole("region", { name: "2(b)" }));
  expect(partB.getByText("未作答，此題送分")).toBeInTheDocument();
  expect(partB.getByText("5 / 5", { exact: false })).toBeInTheDocument();
});

describe("WorkbenchScoreField input", () => {
  it("shows the kept value again after an out-of-range entry", () => {
    render(<WorkbenchScoreField label="分數" max={5} step={0.5} value={1} aiValue={null} onChange={vi.fn()} />);
    const input = screen.getByRole("textbox", { name: "分數" });
    fireEvent.change(input, { target: { value: "10" } });
    fireEvent.blur(input);
    expect((input as HTMLInputElement).value).toBe("1");
  });
});

it("previews zero-point AI drafts and replaces them with official scores", () => {
  const props = {...baseProps, questions: [question()], expanded: true, aiRunning: true,
    aiDraftScores: {a1: {score: 0, feedback: "草稿評語"}}};
  const {rerender} = render(<WorkbenchStudentRow {...props} row={studentRow([answer({score: null, feedback: ""})], {source: "none"})} />);
  expect(screen.getByText("AI 草稿")).toBeInTheDocument();
  expect(screen.getByRole("textbox", {name: "分數"})).toHaveValue("0");
  expect(screen.getByText("草稿評語", {selector: "span"})).toBeInTheDocument();
  rerender(<WorkbenchStudentRow {...props} row={studentRow([answer({score: 2, feedback: "正式評語"})], {source: "ai"})} />);
  expect(screen.queryByText("AI 草稿")).not.toBeInTheDocument();
  expect(screen.getByRole("textbox", {name: "分數"})).toHaveValue("2");
});
