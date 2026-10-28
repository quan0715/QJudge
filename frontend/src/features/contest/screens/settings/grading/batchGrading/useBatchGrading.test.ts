import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/core/types/chatbot.types";
import type { GradingAnswerRow } from "../gradingTypes";

const mocks = vi.hoisted(() => ({
  sessions: [] as { id: string; metadata?: Record<string, unknown> }[],
  runState: { status: "ready", run: null } as { status: string; run: { id: string; sessionId: string } | null },
  select: vi.fn(),
  refreshSessions: vi.fn(),
  createTaskSession: vi.fn(),
  getSession: vi.fn(),
  getActiveRuns: vi.fn(),
  startRun: vi.fn(),
  cancelRun: vi.fn(),
  getModels: vi.fn(),
  getChatRun: vi.fn(),
  getExamQuestions: vi.fn(),
  getBatchGradeWrites: vi.fn(),
  getGradingProgress: vi.fn(),
  getGradingUnit: vi.fn(),
  ungradeExamAnswer: vi.fn(),
}));

vi.mock("@copilot", () => ({
  useCopilotSessions: () => ({ sessions: mocks.sessions, select: mocks.select, refresh: mocks.refreshSessions }),
  useCopilotRun: () => ({ state: mocks.runState }),
}));
vi.mock("@/features/chatbot/contexts/CopilotDemandContext", () => ({ useRequestCopilot: () => undefined }));
vi.mock("@/features/ai-tasks/lib/aiTaskRuntime", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createTaskSession: mocks.createTaskSession,
}));
vi.mock("@/infrastructure/api/repositories/chatbot.repository", () => ({
  default: {
    getSession: mocks.getSession,
    getActiveRuns: mocks.getActiveRuns,
    startRun: mocks.startRun,
    cancelRun: mocks.cancelRun,
    getModels: mocks.getModels,
    getChatRun: mocks.getChatRun,
  },
}));
vi.mock("@/infrastructure/api/repositories/examAnswers.repository", () => ({
  getBatchGradeWrites: mocks.getBatchGradeWrites,
  getGradingProgress: mocks.getGradingProgress,
  getGradingUnit: mocks.getGradingUnit,
  ungradeExamAnswer: mocks.ungradeExamAnswer,
}));
vi.mock("@/infrastructure/api/repositories/examQuestions.repository", () => ({ getExamQuestions: mocks.getExamQuestions }));

import { useBatchGrading } from "./useBatchGrading";

const BATCH = { task_manifest: { schema_version: 1, task_type: "grading.batch", context: { contest_id: "c1" } } };

const row = (overrides: Partial<GradingAnswerRow>): GradingAnswerRow =>
  ({
    id: "a1", studentId: "s1", questionId: "q1", questionIndex: 1, questionType: "essay",
    maxScore: 10, answerContent: { text: "答案" }, score: null, feedback: "", ...overrides,
  }) as GradingAnswerRow;

const ROWS = [row({ id: "a1", questionId: "q1" }), row({ id: "a2", questionId: "q2", questionIndex: 2 })];

const request = (runId: string, questionIds: string[]): ChatMessage => ({
  id: `u-${runId}`, role: "user", timestamp: new Date(0), runId,
  content: `batch_units: ${JSON.stringify([{ id: "u", label: "第 1 題", question_ids: questionIds }])}\n請批改第 1 題。`,
});

const receipt = (id: string, score: number, current = true) =>
  ({ exam_answer_id: id, question_id: "q1", score, feedback: "AI", current });

function render(rows = ROWS, reloadAnswers = vi.fn().mockResolvedValue(rows)) {
  return renderHook(() => useBatchGrading("c1", rows, { resultsPublished: false, reloadAnswers }));
}

const prompts = () => mocks.startRun.mock.calls.map(([, prompt]) => prompt as string);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sessions = [];
  mocks.runState = { status: "ready", run: null };
  mocks.getSession.mockResolvedValue({ messages: [] });
  mocks.getActiveRuns.mockResolvedValue([]);
  mocks.startRun.mockResolvedValue({ id: "r1" });
  mocks.getModels.mockResolvedValue([{ model_id: "default-model", is_default: true }]);
  mocks.getExamQuestions.mockResolvedValue([1, 2].map((i) => ({ id: `q${i}`, questionType: "essay", score: 10, order: i - 1 })));
  mocks.getBatchGradeWrites.mockResolvedValue([]);
  mocks.getGradingProgress.mockResolvedValue([]);
  mocks.ungradeExamAnswer.mockResolvedValue({});
});

describe("starting AI grading", () => {
  it("start opens a session and asks one run for every ungraded question", async () => {
    mocks.createTaskSession.mockResolvedValue({ sessionId: "s1" });
    const { result } = render();

    await act(() => result.current.start("model-x"));

    expect(mocks.createTaskSession).toHaveBeenCalledWith(expect.objectContaining({ taskType: "grading.batch" }));
    expect(prompts()).toHaveLength(1);
    const units = JSON.parse(prompts()[0].split("\n")[0].slice("batch_units: ".length));
    expect(units.map((unit: { question_ids: string[] }) => unit.question_ids)).toEqual([["q1"], ["q2"]]);
    expect(mocks.startRun.mock.calls[0][2]).toMatchObject({ modelOverride: "model-x" });
    expect(mocks.select).toHaveBeenLastCalledWith("s1");
  });

  it("startQuestion reuses the session and re-selects it so the copilot streams the run", async () => {
    mocks.sessions = [{ id: "s1", metadata: BATCH }];
    const { result } = render();
    await waitFor(() => expect(result.current.sessionId).toBe("s1"));

    await act(() => result.current.startQuestion(["q2"]));

    expect(mocks.createTaskSession).not.toHaveBeenCalled();
    expect(mocks.startRun.mock.calls[0][0]).toBe("s1");
    expect(mocks.startRun.mock.calls[0][2]).toMatchObject({ modelOverride: "default-model" });
    expect(Math.max(...mocks.select.mock.invocationCallOrder)).toBeGreaterThan(Math.max(...mocks.startRun.mock.invocationCallOrder));
  });

  it("startQuestion can open a new session", async () => {
    mocks.sessions = [{ id: "s1", metadata: BATCH }];
    mocks.createTaskSession.mockResolvedValue({ sessionId: "s2" });
    const { result } = render();
    await waitFor(() => expect(result.current.sessionId).toBe("s1"));

    await act(() => result.current.startQuestion(["q1"], "model-x", { newSession: true }));

    expect(mocks.startRun.mock.calls[0][0]).toBe("s2");
    await waitFor(() => expect(result.current.sessionId).toBe("s2"));
  });

  it("resume and regrade keep the model the batch was started with", async () => {
    mocks.sessions = [{ id: "s1", metadata: BATCH }];
    mocks.getSession.mockResolvedValue({
      messages: [request("r0", ["q1"]), { id: "u-chat", role: "user", timestamp: new Date(0), runId: "r9", content: "這題為什麼扣分？" }],
    });
    mocks.getChatRun.mockImplementation(async (id: string) => ({ id, modelId: id === "r0" ? "model-x" : "chat-model" }));
    const { result } = render();
    await waitFor(() => expect(result.current.questions[0].status).toBe("failed"));

    await act(() => result.current.resume());
    await act(() => result.current.regradeQuestion("q1"));

    expect(mocks.getChatRun).toHaveBeenCalledWith("r0");
    expect(mocks.startRun.mock.calls.map(([, , options]) => options.modelOverride)).toEqual(["model-x", "model-x"]);
  });

  it("stop cancels the session's active runs", async () => {
    mocks.sessions = [{ id: "s1", metadata: BATCH }];
    mocks.getActiveRuns.mockResolvedValue([{ id: "r1", sessionId: "s1", status: "running" }]);
    const { result } = render();
    await waitFor(() => expect(result.current.sessionId).toBe("s1"));

    await act(() => result.current.stop());

    expect(mocks.cancelRun).toHaveBeenCalledWith("r1");
  });
});

describe("batch state", () => {
  it("shows a question as running while its run is active and completed once its unit is submitted", async () => {
    mocks.sessions = [{ id: "s1", metadata: BATCH }];
    mocks.getSession.mockResolvedValue({ messages: [request("r1", ["q1"])] });
    mocks.getActiveRuns.mockResolvedValue([{ id: "r1", sessionId: "s1", status: "running" }]);
    const { result } = render();
    await waitFor(() => expect(result.current.questions[0].status).toBe("running"));

    mocks.getActiveRuns.mockResolvedValue([]);
    mocks.getGradingProgress.mockResolvedValue([{ unit_id: "u", run_id: "r1", question_ids: ["q1"], status: "completed" }]);
    mocks.runState = { status: "ready", run: { id: "r1", sessionId: "s1" } };
    const { result: next } = render();
    await waitFor(() => expect(next.current.questions[0].status).toBe("completed"));
  });

  it("lists answers still holding the AI's grade", async () => {
    mocks.sessions = [{ id: "s1", metadata: BATCH }];
    mocks.getBatchGradeWrites.mockResolvedValue([receipt("a1", 8), receipt("a2", 3)]);
    const rows = [row({ id: "a1", score: 8, feedback: "AI" }), row({ id: "a2", score: 4, feedback: "TA" })];
    const { result } = render(rows);

    await waitFor(() => expect([...result.current.aiWrittenAnswerIds]).toEqual(["a1"]));
  });

  it("loads the AI's rubric and drafts from the question's latest unit", async () => {
    mocks.sessions = [{ id: "s1", metadata: BATCH }];
    mocks.getGradingProgress.mockResolvedValue([{ unit_id: "u1", run_id: "r1", question_ids: ["q1"], status: "draft" }]);
    mocks.getGradingUnit.mockResolvedValue({ rubric: { criteria: [] }, grades: [] });
    const { result } = render();
    await waitFor(() => expect(result.current.units).toHaveLength(1));

    expect(await result.current.loadQuestionFiles("q1")).toEqual({ rubric: { criteria: [] }, grades: [] });
    expect(mocks.getGradingUnit).toHaveBeenCalledWith("c1", "s1", "u1");
  });
});

describe("revert and regrade", () => {
  it("revert clears only unchanged AI grades", async () => {
    mocks.sessions = [{ id: "s1", metadata: BATCH }];
    mocks.getBatchGradeWrites.mockResolvedValue([receipt("a1", 8), receipt("a9", 3)]);
    const rows = [row({ id: "a1", score: 8, feedback: "AI" }), row({ id: "a9", score: 7, feedback: "TA" })];
    const { result } = render(rows);
    await waitFor(() => expect(result.current.sessionId).toBe("s1"));

    expect(await act(() => result.current.revertQuestion("q1"))).toEqual(["a1"]);
    expect(mocks.ungradeExamAnswer.mock.calls).toEqual([["c1", "a1", { score: 8, feedback: "AI", batchSessionId: "s1" }]]);
  });

  it("revert waits while the question's run is active", async () => {
    mocks.sessions = [{ id: "s1", metadata: BATCH }];
    mocks.getSession.mockResolvedValue({ messages: [request("r1", ["q1"])] });
    mocks.getActiveRuns.mockResolvedValue([{ id: "r1", sessionId: "s1", status: "running" }]);
    const { result } = render();
    await waitFor(() => expect(result.current.questions[0].status).toBe("running"));

    await expect(result.current.revertQuestion("q1")).rejects.toThrow();
    expect(mocks.ungradeExamAnswer).not.toHaveBeenCalled();
  });

  it("regrade clears the whole group's AI grades and asks again with the teacher's note", async () => {
    mocks.sessions = [{ id: "s1", metadata: BATCH }];
    mocks.getExamQuestions.mockResolvedValue([1, 2].map((i) => ({ id: `q${i}`, groupId: "g", questionType: "essay", score: 10, order: i - 1 })));
    const graded = [
      row({ id: "a1", questionId: "q1", questionGroupId: "g", score: 8, feedback: "AI" }),
      row({ id: "a2", questionId: "q2", questionGroupId: "g", questionIndex: 2, score: 5, feedback: "AI" }),
    ];
    mocks.getBatchGradeWrites.mockResolvedValue([receipt("a1", 8), { ...receipt("a2", 5), question_id: "q2" }]);
    let current = graded;
    mocks.ungradeExamAnswer.mockImplementation(async (_contest: string, id: string) => {
      current = current.map((r) => (r.id === id ? { ...r, score: null, feedback: "" } : r));
    });
    const reload = vi.fn(async () => current);
    const { result } = render(graded, reload);
    await waitFor(() => expect(result.current.sessionId).toBe("s1"));

    await act(() => result.current.regradeQuestion("q1", "loop is one point"));

    expect(mocks.ungradeExamAnswer).toHaveBeenCalledTimes(2);
    const [unit] = JSON.parse(prompts()[0].split("\n")[0].slice("batch_units: ".length));
    expect(unit).toMatchObject({ question_ids: ["q1", "q2"], teacher_note: "loop is one point" });
  });
});

describe("polling", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("polls every five seconds while a run is active and re-reads the session only when runs change", async () => {
    mocks.sessions = [{ id: "s1", metadata: BATCH }];
    mocks.getActiveRuns.mockResolvedValue([{ id: "r1", sessionId: "s1", status: "running" }]);
    render();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(5_100);
    expect(mocks.getActiveRuns).toHaveBeenCalledTimes(2);
    expect(mocks.getSession).toHaveBeenCalledTimes(1);

    mocks.getActiveRuns.mockResolvedValue([]);
    await vi.advanceTimersByTimeAsync(5_100);
    expect(mocks.getSession).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(6_000);
    expect(mocks.getActiveRuns).toHaveBeenCalledTimes(3);
  });

  it("reloads the page's answers when the AI's writes change", async () => {
    mocks.sessions = [{ id: "s1", metadata: BATCH }];
    mocks.getActiveRuns.mockResolvedValue([{ id: "r1", sessionId: "s1", status: "running" }]);
    const reload = vi.fn().mockResolvedValue(ROWS);
    render(ROWS, reload);
    await vi.advanceTimersByTimeAsync(0);
    expect(reload).not.toHaveBeenCalled();

    mocks.getBatchGradeWrites.mockResolvedValue([receipt("a1", 8)]);
    await vi.advanceTimersByTimeAsync(5_100);
    expect(reload).toHaveBeenCalledTimes(1);

    // One write changed and another arrived: same count, different content.
    mocks.getBatchGradeWrites.mockResolvedValue([{ ...receipt("a2", 5), question_id: "q2" }]);
    await vi.advanceTimersByTimeAsync(5_100);
    expect(reload).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(5_100);
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
