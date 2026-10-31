import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useState, type ReactNode } from "react";
import { WorkbenchRailHeader } from "./workbench/WorkbenchRailHeader";
import type { ExamPaper, ExamQuestion } from "@/core/entities/contest.entity";
import type { GradingAnswerRow } from "./grading/gradingTypes";
import ContestGradingWorkbenchScreen from "./ContestGradingWorkbenchScreen";

const mocks = vi.hoisted(() => ({
  gradeAnswer: vi.fn(),
  showToast: vi.fn(),
  getExamPaper: vi.fn(),
  batch: {
    questions: [] as { questionId: string; status: string; ungradedCount: number; writtenCount: number; label: string; index: number }[],
    sessionId: null as string | null,
    units: [] as {unit_id: string; question_ids: string[]; run_id: string; total_count: number; draft_count: number; written_count: number; skipped_count: number; status: string}[],
    aiWrittenAnswerIds: new Set<string>(),
    overall: { ungradedTotal: 0 },
    canStart: true,
    busy: false,
    start: vi.fn(),
    startQuestion: vi.fn(),
    regradeQuestion: vi.fn(),
    revertQuestion: vi.fn(),
    loadQuestionFiles: vi.fn(),
    resume: vi.fn(),
    stop: vi.fn(),
    error: undefined as string | undefined,
  },
  suggestions: {} as Record<string, { score: number | null; reason: string; synced: boolean }>,
  suggest: { start: vi.fn(), adopt: vi.fn(), skip: vi.fn() },
}));

vi.mock("@/features/contest/contexts", () => ({
  useContest: () => ({ contest: { id: "exam", resultsPublished: false } }),
}));
vi.mock("@/features/auth/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: 1 } }),
}));
vi.mock("@/shared/contexts/ToastContext", () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}));
vi.mock("@/infrastructure/api/repositories/examPaper.repository", () => ({
  getExamPaper: mocks.getExamPaper,
}));
vi.mock("@/shared/ui/markdown/MarkdownContent", () => ({
  default: { Problem: ({ children }: { children: ReactNode }) => <div>{children}</div> },
}));
vi.mock("@/features/contest/components/exam/AnswerDisplay", () => ({
  default: () => <div>Original answer</div>,
}));
vi.mock("@/features/chatbot/adapters/qJudgeCopilotMessageData", () => ({
  selectLatestTodoItems: () => [{ id: "t1", label: "Read the SOP", status: "in_progress" }],
}));
vi.mock("@copilot", () => ({
  useCopilotSessions: () => ({ activeSession: { status: "ready", data: { id: "sess", messages: [] } } }),
  useCopilotModels: () => ({
    models: [{ id: "m1", displayName: "Model" }],
    selectedModelId: "m1",
    status: "ready",
    error: null,
  }),
}));
vi.mock("./grading/batchGrading/useBatchGrading", () => ({
  useBatchGrading: () => mocks.batch,
}));
vi.mock("./grading/workbench/useQuestionSuggestions", () => ({
  useQuestionSuggestions: () => ({ suggestions: mocks.suggestions, running: false, ...mocks.suggest }),
}));
vi.mock("./grading/components/ScorePolicyMenu", () => ({
  default: ({ leadingItems, trailingItems }: { leadingItems?: ReactNode; trailingItems?: ReactNode }) => (
    <div data-testid="policy-menu">
      {leadingItems}
      {trailingItems}
    </div>
  ),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: unknown, options?: Record<string, unknown>) => {
      const text = typeof fallback === "string" ? fallback : key;
      const values = (typeof fallback === "object" ? fallback : options) as Record<string, unknown> | undefined;
      return text.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(values?.[name] ?? ""));
    },
  }),
}));

const q = (id: string, order: number, over: Partial<ExamQuestion>) =>
  ({ id, order, questionType: "short_answer", prompt: `Prompt ${id}`, options: [], explanation: "", ...over }) as ExamQuestion;
const groupQuestions = [
  q("a", 0, { groupId: "group", orderInGroup: 0, score: 3 }),
  q("b", 1, { groupId: "group", orderInGroup: 1, score: 5 }),
];
const single = q("c", 2, { score: 17, prompt: "Write a bill" });
const choice = q("d", 3, { score: 4, questionType: "single_choice", options: ["Pass", "Good", "Fail", "None"], correctAnswer: 2 });
const paper = {
  questions: [...groupQuestions, single, choice],
  groups: [],
  sections: [],
  blocks: [
    { kind: "group", id: "group", group: { title: "Shared task", sharedStemMarkdown: "Use one program." }, children: groupQuestions },
    { kind: "question", id: "c", question: single },
    { kind: "question", id: "d", question: choice },
  ],
} as unknown as ExamPaper;

const answer = (studentId: string, question: ExamQuestion, over: Partial<GradingAnswerRow> = {}) =>
  ({
    id: `${studentId}-${question.id}`,
    studentId,
    studentUsername: studentId,
    studentDisplayName: studentId,
    questionId: question.id,
    questionIndex: question.order + 1,
    questionType: question.questionType,
    maxScore: question.score,
    questionOptions: question.options,
    answerContent: { text: "Original answer" },
    score: null,
    feedback: "",
    isAutoGraded: false,
    correctAnswer: question.correctAnswer ?? null,
    ...over,
  }) as GradingAnswerRow;
const rows = [
  ...["s1", "s2"].flatMap((id) => groupQuestions.map((question) => answer(id, question))),
  answer("s1", single, { score: 10, feedback: "ok" }),
  answer("s2", single, { score: 15, feedback: "great", isAiGraded: true }),
  answer("s1", choice, { answerContent: { selected: 2 }, score: 4, isAutoGraded: true }),
  answer("s2", choice, { answerContent: { selected: 0 }, score: 0, isAutoGraded: true }),
];
vi.mock("./grading/useGradingData", () => ({
  useGradingData: () => ({
    loading: false,
    answers: rows,
    students: ["s1", "s2"].map((id) => ({ studentId: id, username: id, displayName: id })),
    answersByStudent: new Map(["s1", "s2"].map((id) => [id, rows.filter((r) => r.studentId === id)])),
    questionProgress: [],
    gradeAnswer: mocks.gradeAnswer,
    reloadAnswers: vi.fn(),
    refreshData: vi.fn(),
  }),
}));

async function setup(query = "grading_question=a&grading_student=s1") {
  const result = render(
    <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}><MemoryRouter initialEntries={[`/?${query}`]}>
      <ContestGradingWorkbenchScreen />
    </MemoryRouter></QueryClientProvider>,
  );
  await screen.findByRole("heading", { level: 1 });
  return result;
}
const rowButton = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}`) });
const expandedRow = (name: string) =>
  screen.getByRole("button", { name: new RegExp(`^${name}`), expanded: true });
function edit(label: string, score: number, feedback: string, index: number) {
  fireEvent.change(screen.getByRole("textbox", { name: label }), { target: { value: String(score) } });
  fireEvent.change(screen.getAllByRole("textbox", { name: "評語（選填）" })[index], { target: { value: feedback } });
}

beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
  mocks.suggestions = {};
  mocks.batch.aiWrittenAnswerIds = new Set(["s2-c"]);
  mocks.batch.sessionId = null;
  mocks.batch.questions = [];
  mocks.batch.error = undefined;
  mocks.batch.sessionId = null;
  mocks.batch.units = [];
  mocks.batch.start.mockResolvedValue(undefined);
  mocks.batch.regradeQuestion.mockResolvedValue(undefined);
  mocks.getExamPaper.mockResolvedValue(paper);
  mocks.gradeAnswer.mockResolvedValue(undefined);
  mocks.suggest.adopt.mockResolvedValue(undefined);
  mocks.suggest.skip.mockResolvedValue(undefined);
  mocks.batch.startQuestion.mockResolvedValue(undefined);
  HTMLElement.prototype.scrollTo = vi.fn();
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

describe("grading workbench", () => {
  it.each(["empty", "error"])("keeps editing reachable from the %s grading state", async (state) => {
    if (state === "empty") mocks.getExamPaper.mockResolvedValue({ ...paper, questions: [], blocks: [] });
    else mocks.getExamPaper.mockRejectedValue(new Error("Paper unavailable"));
    function View() {
      const [mode, setMode] = useState<"edit" | "grade">("grade");
      return mode === "edit" ? <p>Editing resumed</p> : <ContestGradingWorkbenchScreen header={<WorkbenchRailHeader mode="grade" gradeDisabled={false} onModeChange={setMode} />} />;
    }
    render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><View /></MemoryRouter></QueryClientProvider>);
    await screen.findByText(state === "empty" ? "尚無作答資料" : "Paper unavailable");
    fireEvent.click(screen.getByRole("tab", { name: "編輯" }));
    expect(screen.getByText("Editing resumed")).toBeInTheDocument();
  });

  it("saves a sub-question and advances", async () => {
    await setup();
    edit("1(a)", 3, "Complete", 0);
    edit("1(b)", 1, "Partial", 1);
    fireEvent.click(screen.getByRole("button", { name: "儲存並下一位" }));
    await waitFor(() => expect(mocks.gradeAnswer).toHaveBeenCalledTimes(2));
    expect(mocks.gradeAnswer.mock.calls).toEqual([
      ["s1-a", 3, "Complete"],
      ["s1-b", 1, "Partial"],
    ]);
    await waitFor(() => expect(expandedRow("s2")).toBeInTheDocument());
  });

  it("keeps the failed draft on partial failure", async () => {
    mocks.gradeAnswer.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("connection lost"));
    await setup();
    edit("1(a)", 3, "Complete", 0);
    edit("1(b)", 2, "Keep this draft", 1);
    fireEvent.click(screen.getByRole("button", { name: "儲存並下一位" }));
    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith(expect.objectContaining({ kind: "error" })));
    expect(expandedRow("s1")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "1(b)" })).toHaveValue("2");
  });

  it("Cmd/Ctrl+Enter saves and advances", async () => {
    await setup();
    edit("1(a)", 3, "Complete", 0);
    edit("1(b)", 1, "Partial", 1);
    fireEvent.keyDown(screen.getByRole("textbox", { name: "1(b)" }), { key: "Enter", metaKey: true });
    await waitFor(() => expect(mocks.gradeAnswer).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(expandedRow("s2")).toBeInTheDocument());
  });

  it("reads an existing Beta draft", async () => {
    sessionStorage.setItem("grading-workbench:1:exam", JSON.stringify({ "s1-a": { score: 2, feedback: "d" } }));
    await setup();
    expect(screen.getByRole("textbox", { name: "1(a)" })).toHaveValue("2");
  });

  it("filters by source and sorts by score", async () => {
    await setup("grading_question=c");
    fireEvent.change(screen.getByRole("combobox", { name: "來源" }), { target: { value: "ai" } });
    expect(screen.queryByRole("button", { name: /^s1/ })).toBeNull();
    expect(rowButton("s2")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "來源" }), { target: { value: "all" } });
    fireEvent.change(screen.getByRole("combobox", { name: "排序" }), { target: { value: "desc" } });
    const names = screen.getAllByRole("button", { name: /^s\d/ }).map((button) => button.textContent?.slice(0, 2));
    expect(names).toEqual(["s2", "s1"]);
  });

  it("stats show average, rate and graded", async () => {
    await setup("grading_question=c");
    const stats = within(screen.getByRole("region", { name: "作答統計" }));
    expect(stats.getByText("12.5")).toBeInTheDocument();
    expect(stats.getByText("74%")).toBeInTheDocument();
    expect(stats.getByText("2 / 2")).toBeInTheDocument();
  });

  it("adopt all writes every pending suggestion", async () => {
    mocks.suggestions = { "s1-c": { score: 11, reason: "new", synced: false } };
    await setup("grading_question=c");
    expect(screen.getByText("AI 建議 1 份待審查")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "全部採用" }));
    await waitFor(() => expect(mocks.suggest.adopt).toHaveBeenCalled());
    const [entries] = mocks.suggest.adopt.mock.calls[0];
    expect(entries.map((entry: { row: GradingAnswerRow; score: number; feedback: string }) => [entry.row.id, entry.score, entry.feedback])).toEqual([
      ["s1-c", 11, "new"],
    ]);
  });

  it("skip advances without writing", async () => {
    mocks.suggestions = { "s1-c": { score: 11, reason: "new", synced: false } };
    await setup("grading_question=c&grading_student=s1");
    fireEvent.click(screen.getByRole("button", { name: "略過建議" }));
    await waitFor(() => expect(mocks.suggest.skip).toHaveBeenCalledWith(["s1-c"]));
    expect(mocks.gradeAnswer).not.toHaveBeenCalled();
    await waitFor(() => expect(expandedRow("s2")).toBeInTheDocument());
  });

  it("objective unit hides AI button and shows option counts", async () => {
    await setup("grading_question=d");
    expect(screen.queryByRole("button", { name: "AI 批改這題" })).toBeNull();
    expect(screen.getByText("自動批改", { ignore: "option" })).toBeInTheDocument();
    expect(screen.getByText("A 1 · B 0 · C✓ 1 · D 0")).toBeInTheDocument();
  });

  it("question modal routes to batch.startQuestion", async () => {
    await setup("grading_question=a");
    fireEvent.click(screen.getByRole("button", { name: "AI 批改這題" }));
    fireEvent.click(await screen.findByRole("button", { name: "開始" }));
    await waitFor(() => expect(mocks.batch.startQuestion).toHaveBeenCalledWith(["a", "b"], "m1"));
  });

  it("shows shared AI provenance and human-confirmed adoption without an owned batch", async () => {
    mocks.batch.aiWrittenAnswerIds = new Set();
    mocks.suggestions = { "s1-c": { score: 10, reason: "ok", synced: true } };
    await setup("grading_question=c");
    expect(within(rowButton("s1")).getByText("人工確認")).toBeInTheDocument();
    expect(within(rowButton("s2")).getByText("AI")).toBeInTheDocument();
  });

  it("regrade without anything AI-written explains instead of doing nothing", async () => {
    mocks.batch.aiWrittenAnswerIds = new Set();
    // Another grader's AI result is visible, but this session cannot revoke it.
    mocks.suggestions = { "s1-c": { score: 10, reason: "ok", synced: true } };
    await setup("grading_question=c");
    fireEvent.click(screen.getByRole("button", { name: "AI 批改這題" }));
    fireEvent.click(await screen.findByRole("button", { name: "開始" }));
    expect(await screen.findByText("這題沒有 AI 寫入的分數可以重改")).toBeInTheDocument();
    expect(mocks.batch.regradeQuestion).not.toHaveBeenCalled();
  });

  it("regrade reverts and requeues when the batch session has AI writes", async () => {
    mocks.batch.sessionId = "s1";
    await setup("grading_question=c");
    fireEvent.click(screen.getByRole("button", { name: "AI 批改這題" }));
    fireEvent.click(await screen.findByRole("button", { name: "開始" }));
    await waitFor(() => expect(mocks.batch.regradeQuestion).toHaveBeenCalledWith("c", undefined, "m1"));
  });

  it("whole-exam AI reuses an existing batch session", async () => {
    mocks.batch.sessionId = "s1";
    await setup("grading_question=c");
    fireEvent.click(screen.getByRole("button", { name: "AI 批改整份考卷" }));
    fireEvent.click(await screen.findByRole("button", { name: "開始" }));
    await waitFor(() => expect(mocks.batch.startQuestion).toHaveBeenCalledWith(["a", "b"], "m1"));
    expect(mocks.batch.start).not.toHaveBeenCalled();
  });

  it("saving one graded child leaves the other ungraded child untouched", async () => {
    await setup();
    edit("1(a)", 3, "Complete", 0);
    fireEvent.click(screen.getByRole("button", { name: "儲存並下一位" }));
    await waitFor(() =>
      expect(mocks.showToast).toHaveBeenCalledWith(expect.objectContaining({ kind: "success" })),
    );
    expect(mocks.gradeAnswer.mock.calls).toEqual([["s1-a", 3, "Complete"]]);
  });

  it("uses the redistributed max score for stats", async () => {
    const targets = rows.filter((row) => row.questionId === "c");
    targets.forEach((row) => (row.effectiveMaxScore = 20));
    try {
      await setup("grading_question=c");
      const stats = within(screen.getByRole("region", { name: "作答統計" }));
      // Raw 10 and 15 of 17 scale to the redistributed 20 like the backend: (11.76 + 17.65) / 2 / 20.
      expect(stats.getByText("74%")).toBeInTheDocument();
      expect(stats.getByText("/ 20", { exact: false })).toBeInTheDocument();
    } finally {
      targets.forEach((row) => delete row.effectiveMaxScore);
    }
  });

  it("a question group shows its AI notice once", async () => {
    mocks.batch.questions = ["a", "b"].map((questionId, index) => ({
      questionId,
      status: "running",
      ungradedCount: 2,
      writtenCount: 0,
      label: `Q${index + 1}`,
      index,
    }));
    await setup("grading_question=a");
    expect(screen.getAllByText("grading.batch.noticeRunning")).toHaveLength(1);
  });

  it("ungraded rows of a running unit show that AI is grading them", async () => {
    mocks.batch.questions = ["a", "b"].map((questionId, index) => ({
      questionId,
      status: "running",
      ungradedCount: 2,
      writtenCount: 0,
      label: `Q${index + 1}`,
      index,
    }));
    await setup("grading_question=a");
    expect(screen.getByRole("button", { name: /^s1/ })).toHaveTextContent("AI 批改中");
    expect(screen.getByRole("button", { name: /^s2/ })).toHaveTextContent("AI 批改中");
  });

  it("rail reads durable draft counts independently of submitted grades", async () => {
    mocks.batch.sessionId = "sess";
    mocks.batch.units = [{unit_id: "group_g", question_ids: ["a", "b"], run_id: "r1", total_count: 4, draft_count: 3, written_count: 0, skipped_count: 0, status: "draft"}];
    mocks.batch.questions = ["a", "b"].map((questionId, index) => ({
      questionId,
      status: "running",
      ungradedCount: 2,
      writtenCount: 0,
      label: `Q${index + 1}`,
      index,
    }));
    await setup("grading_question=c");
    const rail = within(screen.getByRole("navigation", { name: "題目" }));
    expect(rail.getByRole("progressbar", { name: "1.草稿完成進度" })).toHaveAttribute("title", "草稿已完成 3/4 · 已寫入 0/2");
    expect(rail.getByRole("progressbar", { name: "1.草稿完成進度" })).toHaveAttribute("aria-valuenow", "75");
    expect(screen.getByText("Read the SOP")).toBeInTheDocument();
  });

  it("rail counts only fully saved students while a group is running", async () => {
    mocks.batch.questions = ["a", "b"].map((questionId, index) => ({questionId, status: "running", ungradedCount: 2, writtenCount: 0, label: `Q${index+1}`, index}));
    const saved = rows.filter(row => row.studentId === "s1" && ["a", "b"].includes(row.questionId));
    saved.forEach(row => { row.score = 1; });
    try {
      await setup("grading_question=c");
      const rail = within(screen.getByRole("navigation", {name: "題目"}));
      expect(rail.getByRole("progressbar", { name: "1.草稿完成進度" })).toHaveAttribute("title", "等待批改草稿 · 已寫入 1/2");
    } finally {
      saved.forEach(row => { row.score = null; });
    }
  });

  it("a single question has one header menu holding the AI actions", async () => {
    mocks.batch.questions = [
      { questionId: "c", status: "completed", ungradedCount: 0, writtenCount: 2, label: "3.", index: 2, runId: "r1" } as never,
    ];
    await setup("grading_question=c");
    expect(screen.queryByRole("button", { name: "AI 操作" })).toBeNull();
    expect(within(screen.getByTestId("policy-menu")).getByText("AI 評分標準")).toBeInTheDocument();
  });

  it("shows batch grading errors instead of failing silently", async () => {
    mocks.batch.error = "停止失敗：連線逾時";
    await setup("grading_question=c");
    expect(screen.getByText("停止失敗：連線逾時")).toBeInTheDocument();
  });

  it("starting AI on a question can open a new batch session", async () => {
    mocks.batch.sessionId = "sess";
    await setup("grading_question=a");
    fireEvent.click(screen.getByRole("button", { name: "AI 批改這題" }));
    fireEvent.click(await screen.findByText("開新的 session"));
    fireEvent.click(screen.getByRole("button", { name: "開始" }));
    await waitFor(() =>
      expect(mocks.batch.startQuestion).toHaveBeenCalledWith(["a", "b"], "m1", { newSession: true }),
    );
  });

  it("rail progress counts fully graded students", async () => {
    await setup("grading_question=c");
    const rail = within(screen.getByRole("navigation", { name: "題目" }));
    expect(rail.getByRole("button", { name: /1./ })).toHaveTextContent("0/2");
    expect(rail.getByRole("button", { name: /1\. Shared task/ })).toBeInTheDocument();
    expect(rail.getByRole("button", { name: /2\. Write a bill/ })).toHaveAttribute("aria-current", "page");
  });
});

vi.mock("./grading/workbench/useGradeCsvProgress", () => ({ useGradeCsvProgress: () => ({progress: {}}) }));
