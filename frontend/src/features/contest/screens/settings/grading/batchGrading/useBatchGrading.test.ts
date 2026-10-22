import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/core/types/chatbot.types";
import type { GradingAnswerRow } from "../gradingTypes";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  refreshSessions: vi.fn(),
  sessions: [] as { id: string; metadata?: Record<string, unknown> }[],
  createTaskSession: vi.fn(),
  uploadUserArtifact: vi.fn(),
  listArtifacts: vi.fn(),
  fetchArtifactContent: vi.fn(),
  getSession: vi.fn(),
  getActiveRuns: vi.fn(),
  startRun: vi.fn(),
  cancelRun: vi.fn(),
  ungradeExamAnswer: vi.fn(),
  getBatchGradeWrites: vi.fn(),
  getModels: vi.fn(),
  getRun: vi.fn(),
}));

vi.mock("@copilot", () => ({
  useCopilotSessions: () => ({
    sessions: mocks.sessions,
    select: mocks.select,
    refresh: mocks.refreshSessions,
  }),
}));
vi.mock("@/features/chatbot/contexts/CopilotDemandContext", () => ({
  useRequestCopilot: () => undefined,
}));
vi.mock("@/features/ai-tasks/lib/aiTaskRuntime", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createTaskSession: mocks.createTaskSession,
}));
vi.mock("@/infrastructure/api/repositories/artifact.repository", () => ({
  uploadUserArtifact: mocks.uploadUserArtifact,
  listArtifacts: mocks.listArtifacts,
  fetchArtifactContent: mocks.fetchArtifactContent,
}));
vi.mock("@/infrastructure/api/repositories/chatbot.repository", () => ({
  getChatRun: mocks.getRun,
  default: {
    getSession: mocks.getSession,
    getModels: mocks.getModels,
    getRun: mocks.getRun,
    getActiveRuns: mocks.getActiveRuns,
    startRun: mocks.startRun,
    cancelRun: mocks.cancelRun,
  },
}));
vi.mock("@/infrastructure/api/repositories/examAnswers.repository", () => ({
  ungradeExamAnswer: mocks.ungradeExamAnswer,
  getBatchGradeWrites: mocks.getBatchGradeWrites,
}));

import { useBatchGrading } from "./useBatchGrading";

const row = (overrides: Partial<GradingAnswerRow>): GradingAnswerRow =>
  ({
    id: "a1",
    studentUsername: "s1",
    questionId: "q1",
    questionIndex: 1,
    questionType: "essay",
    maxScore: 10,
    answerContent: { text: "答案" },
    score: null,
    feedback: "",
    ...overrides,
  }) as GradingAnswerRow;

const ROWS = [
  row({ id: "a1", questionId: "q1", questionIndex: 1 }),
  row({ id: "a2", questionId: "q2", questionIndex: 2 }),
  row({ id: "a3", questionId: "q3", questionIndex: 3, score: 5 }),
];
const BATCH_CONTEXT = {
  task_manifest: { schema_version: 1, task_type: "grading.batch", context: { contest_id: "c1" } },
};

const userMessage = (questionId: string, runId: string): ChatMessage => ({
  id: `u-${runId}`,
  role: "user",
  content: `batch_question_id: ${questionId}\n請批改`,
  timestamp: new Date(0),
  runId,
});

function render(rows = ROWS, reloadAnswers = vi.fn().mockResolvedValue(rows)) {
  return renderHook(() =>
    useBatchGrading("c1", rows, { resultsPublished: false, reloadAnswers }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sessions = [];
  mocks.getBatchGradeWrites.mockResolvedValue([]);
  mocks.getModels.mockResolvedValue([{ model_id: "default-model", is_default: true }]);
  mocks.getRun.mockResolvedValue({ modelId: "legacy-model" });
  mocks.listArtifacts.mockResolvedValue([]);
  mocks.getActiveRuns.mockResolvedValue([]);
  mocks.getSession.mockResolvedValue({ messages: [] });
  mocks.uploadUserArtifact.mockResolvedValue({});
  mocks.startRun.mockImplementation(async () => ({ id: `run-${mocks.startRun.mock.calls.length}` }));
  mocks.cancelRun.mockResolvedValue({});
  mocks.ungradeExamAnswer.mockResolvedValue({});
});

describe("useBatchGrading", () => {
  it("start creates session, uploads artifacts, starts runs in question order, binds copilot", async () => {
    mocks.createTaskSession.mockResolvedValue({ sessionId: "s1" });
    const { result } = render();

    await act(() => result.current.start("model-x"));

    expect(mocks.createTaskSession).toHaveBeenCalledWith(
      expect.objectContaining({ taskType: "grading.batch", context: { contest_id: "c1" } }),
    );
    const uploaded = mocks.uploadUserArtifact.mock.calls.map(([, file, options]) => [
      (file as File).name,
      options,
    ]);
    expect(uploaded).toEqual([
      ["batch.json", { step: "batch" }],
      ["grade_q1.csv", { step: "batch" }],
      ["grade_q2.csv", { step: "batch" }],
    ]);
    expect(mocks.startRun.mock.calls.map(([, prompt]) => (prompt as string).split("\n")[0])).toEqual([
      "batch_question_id: q1",
      "batch_question_id: q2",
    ]);
    expect(mocks.startRun.mock.calls[0][2]).toMatchObject({ modelOverride: "model-x" });
    expect(mocks.select).toHaveBeenCalledWith("s1");
  });

  it("binds copilot to existing batch session on mount", async () => {
    mocks.sessions = [{ id: "s1", metadata: BATCH_CONTEXT }];
    const { result } = render();

    await waitFor(() => expect(result.current.sessionId).toBe("s1"));
    expect(mocks.select).toHaveBeenCalledWith("s1");
  });

  it("stop cancels queued runs before the running run", async () => {
    mocks.sessions = [{ id: "s1", metadata: BATCH_CONTEXT }];
    mocks.getActiveRuns.mockResolvedValue([
      { id: "r1", sessionId: "s1", status: "running" },
      { id: "r2", sessionId: "s1", status: "queued" },
      { id: "r9", sessionId: "other", status: "queued" },
    ]);
    const { result } = render();
    await waitFor(() => expect(result.current.sessionId).toBe("s1"));

    await act(() => result.current.stop());

    expect(mocks.cancelRun.mock.calls.map(([id]) => id)).toEqual(["r2", "r1"]);
  });

  it("resume enqueues every question that still has ungraded answers", async () => {
    mocks.sessions = [{ id: "s1", metadata: BATCH_CONTEXT }];
    mocks.getSession.mockResolvedValue({
      messages: [userMessage("q1", "r1"), userMessage("q2", "r2")],
    });
    mocks.listArtifacts.mockResolvedValue([
      { artifact_id: "p", filename: "progress.csv", updated_at: "2026-10-22T00:00:00Z" },
    ]);
    mocks.fetchArtifactContent.mockResolvedValue({
      content:
        "question_id,run_id,status,written_count,skipped_count,out_of_range_count,error,updated_at\n" +
        "q1,r1,completed,1,0,0,,x\nq2,r2,failed,0,0,0,boom,x\n",
      contentType: "text/csv",
    });
    const { result } = render();
    await waitFor(() =>
      expect(result.current.questions.map((q) => q.status)).toEqual([
        "completed",
        "failed",
        "skipped",
      ]),
    );

    await act(() => result.current.resume());

    // q1 completed but its answer is still ungraded (e.g. rejected or out of range); q3 is skipped.
    expect(mocks.startRun.mock.calls.map(([, prompt]) => (prompt as string).split("\n")[0])).toEqual([
      "batch_question_id: q1",
      "batch_question_id: q2",
    ]);
  });

  it("revert is rejected while the question has an active run", async () => {
    mocks.sessions = [{ id: "s1", metadata: BATCH_CONTEXT }];
    mocks.getSession.mockResolvedValue({ messages: [userMessage("q1", "r1")] });
    mocks.getActiveRuns.mockResolvedValue([{ id: "r1", sessionId: "s1", status: "running" }]);
    const { result } = render();
    await waitFor(() => expect(result.current.questions[0]?.status).toBe("running"));

    await expect(result.current.revertQuestion("q1")).rejects.toThrow();
    expect(mocks.ungradeExamAnswer).not.toHaveBeenCalled();
  });

  it("revert ungrades only unchanged AI answers and rewrites the written file", async () => {
    mocks.sessions = [{ id: "s1", metadata: BATCH_CONTEXT }];
    mocks.listArtifacts.mockResolvedValue([
      { artifact_id: "w", filename: "written_q1.csv", updated_at: "2026-10-22T00:00:00Z" },
    ]);
    mocks.fetchArtifactContent.mockResolvedValue({
      content: "exam_answer_id,score,feedback\na1,8.0,AI\na9,3.0,AI\n",
      contentType: "text/csv",
    });
    const rows = [
      row({ id: "a1", questionId: "q1", score: 8, feedback: "AI" }),
      row({ id: "a9", questionId: "q1", score: 7, feedback: "TA 改過" }),
    ];
    const reloadAnswers = vi.fn().mockResolvedValue(rows);
    const { result } = render(rows, reloadAnswers);
    await waitFor(() => expect(result.current.sessionId).toBe("s1"));

    await act(() => result.current.revertQuestion("q1"));

    expect(mocks.ungradeExamAnswer.mock.calls).toEqual([
      ["c1", "a1", { score: 8, feedback: "AI" }],
    ]);
    const rewritten = mocks.uploadUserArtifact.mock.calls.at(-1)?.[1] as File;
    expect(rewritten.name).toBe("written_q1.csv");
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(rewritten);
    });
    expect(text).toContain("a9");
    expect(text).not.toContain("a1");
    expect(reloadAnswers).toHaveBeenCalled();
  });

  it("revert compares against freshly loaded answers, not the stale page rows", async () => {
    mocks.sessions = [{ id: "s1", metadata: BATCH_CONTEXT }];
    mocks.listArtifacts.mockResolvedValue([
      { artifact_id: "w", filename: "written_q1.csv", updated_at: "2026-10-22T00:00:00Z" },
    ]);
    mocks.fetchArtifactContent.mockResolvedValue({
      content: "exam_answer_id,score,feedback\na1,8.0,AI\n",
      contentType: "text/csv",
    });
    const staleRows = [row({ id: "a1", questionId: "q1", score: 8, feedback: "AI" })];
    // Another teacher changed the score after the AI wrote it.
    const freshRows = [row({ id: "a1", questionId: "q1", score: 6, feedback: "TA" })];
    const { result } = render(staleRows, vi.fn().mockResolvedValue(freshRows));
    await waitFor(() => expect(result.current.sessionId).toBe("s1"));

    const reverted = await act(() => result.current.revertQuestion("q1"));

    expect(reverted).toEqual([]);
    expect(mocks.ungradeExamAnswer).not.toHaveBeenCalled();
  });

  it("revert keeps an answer the server reports as changed after the reload", async () => {
    mocks.sessions = [{ id: "s1", metadata: BATCH_CONTEXT }];
    mocks.listArtifacts.mockResolvedValue([
      { artifact_id: "w", filename: "written_q1.csv", updated_at: "2026-10-22T00:00:00Z" },
    ]);
    mocks.fetchArtifactContent.mockResolvedValue({
      content: "exam_answer_id,score,feedback\na1,8.0,AI\n",
      contentType: "text/csv",
    });
    const rows = [row({ id: "a1", questionId: "q1", score: 8, feedback: "AI" })];
    // Another teacher saved a grade between the reload and the ungrade request.
    mocks.ungradeExamAnswer.mockRejectedValue(Object.assign(new Error("changed"), { status: 409 }));
    const { result } = render(rows, vi.fn().mockResolvedValue(rows));
    await waitFor(() => expect(result.current.sessionId).toBe("s1"));
    mocks.uploadUserArtifact.mockClear();

    const reverted = await act(() => result.current.revertQuestion("q1"));

    expect(reverted).toEqual([]);
    expect(mocks.uploadUserArtifact).not.toHaveBeenCalled();
    expect(result.current.error).toBeUndefined();
  });

  it("drops the batch session started in another contest when the contest changes", async () => {
    mocks.createTaskSession.mockResolvedValue({ sessionId: "s1" });
    const reloadAnswers = vi.fn().mockResolvedValue(ROWS);
    const { result, rerender } = renderHook(
      ({ contestId }) =>
        useBatchGrading(contestId, ROWS, { resultsPublished: false, reloadAnswers }),
      { initialProps: { contestId: "c1" } },
    );
    await act(() => result.current.start());
    expect(result.current.sessionId).toBe("s1");

    rerender({ contestId: "c2" });

    expect(result.current.sessionId).toBeNull();
    expect(result.current.canStart).toBe(true);
    expect(result.current.questions.every((q) => q.status !== "running")).toBe(true);
  });

  it("shows a regrading question as queued until its new run is in place", async () => {
    mocks.sessions = [{ id: "s1", metadata: BATCH_CONTEXT }];
    mocks.getSession.mockResolvedValue({ messages: [userMessage("q1", "r1")] });
    let releaseRun: () => void = () => undefined;
    mocks.startRun.mockImplementation(
      () => new Promise((resolve) => (releaseRun = () => resolve({ id: "r2" }))),
    );
    const { result } = render();
    await waitFor(() => expect(result.current.sessionId).toBe("s1"));

    let regrade: Promise<void> = Promise.resolve();
    act(() => {
      regrade = result.current.regradeQuestion("q1", "註記");
    });
    await waitFor(() => expect(mocks.startRun).toHaveBeenCalled());

    // Reverted answers are ungraded but the new run is not queued yet: no "finish the rest" prompt.
    expect(result.current.questions[0]?.status).toBe("queued");
    await act(async () => {
      releaseRun();
      await regrade;
    });
  });

  it("stop reports a failure instead of throwing", async () => {
    mocks.sessions = [{ id: "s1", metadata: BATCH_CONTEXT }];
    mocks.getActiveRuns.mockResolvedValue([{ id: "r1", sessionId: "s1", status: "running" }]);
    mocks.cancelRun.mockRejectedValue(new Error("網路錯誤"));
    const { result } = render();
    await waitFor(() => expect(result.current.sessionId).toBe("s1"));

    await act(() => result.current.stop());

    expect(result.current.error).toBe("網路錯誤");
    expect(result.current.busy).toBe(false);
  });
});

describe("useBatchGrading polling", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("polls slowly when nothing is running", async () => {
    mocks.sessions = [{ id: "s1", metadata: BATCH_CONTEXT }];
    render();
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.getSession).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(6_000);
    expect(mocks.getSession).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(mocks.getSession).toHaveBeenCalledTimes(2);
  });

  it("polls every five seconds while a run is active", async () => {
    mocks.sessions = [{ id: "s1", metadata: BATCH_CONTEXT }];
    mocks.getSession.mockResolvedValue({ messages: [userMessage("q1", "r1")] });
    mocks.getActiveRuns.mockResolvedValue([{ id: "r1", sessionId: "s1", status: "running" }]);
    render();
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(5_100);
    expect(mocks.getSession).toHaveBeenCalledTimes(2);
  });
});


describe("batch grading recovery", () => {
  it("keeps the selected model after remounting and resuming the batch", async () => {
    mocks.createTaskSession.mockResolvedValue({ sessionId: "s1" });
    const first = render();
    await act(() => first.result.current.start("teacher-selected-model"));
    const config = mocks.uploadUserArtifact.mock.calls.find(([, file]) => file.name === "batch.json")![1] as File;
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(config);
    });
    expect(JSON.parse(text).model_id).toBe("teacher-selected-model");
    first.unmount();
    mocks.sessions = [{ id: "s1", metadata: BATCH_CONTEXT }];
    mocks.listArtifacts.mockResolvedValue([{ artifact_id: "config", filename: "batch.json" }]);
    mocks.fetchArtifactContent.mockResolvedValue({ content: text });
    mocks.startRun.mockClear();
    const second = render();
    await waitFor(() => expect(second.result.current.sessionId).toBe("s1"));
    await act(() => second.result.current.resume());
    expect(mocks.startRun).toHaveBeenCalled();
    for (const call of mocks.startRun.mock.calls) {
      expect(call[2]).toMatchObject({ modelOverride: "teacher-selected-model" });
    }
  });

  it("recovers the model from an existing batch run instead of the default", async () => {
    mocks.sessions = [{ id: "s1", metadata: BATCH_CONTEXT }];
    mocks.getSession.mockResolvedValue({ messages: [userMessage("q1", "r1")] });
    const { result } = render();
    await waitFor(() => expect(result.current.sessionId).toBe("s1"));
    await act(() => result.current.resume());
    expect(mocks.getRun).toHaveBeenCalledWith("r1");
    expect(mocks.startRun.mock.calls[0][2]).toMatchObject({ modelOverride: "legacy-model" });
  });

  it("can revoke a durable batch write when the written artifact was never saved", async () => {
    mocks.getSession.mockResolvedValue({ messages: [userMessage("q1", "r1")] });
    mocks.sessions = [{ id: "s1", metadata: BATCH_CONTEXT }];
    mocks.getBatchGradeWrites.mockResolvedValue([
      { exam_answer_id: "a1", question_id: "q1", score: 8, feedback: "AI", current: true },
    ]);
    const rows = [row({ id: "a1", score: 8, feedback: "AI" })];
    const { result } = render(rows);
    await waitFor(() => expect(result.current.overall.writtenCount).toBe(1));
    await act(() => result.current.revertQuestion("q1"));
    expect(mocks.ungradeExamAnswer).toHaveBeenCalledWith("c1", "a1", { score: 8, feedback: "AI" });
  });

  it("does not resurrect a revoked receipt from an old CSV copy", async () => {
    mocks.sessions = [{ id: "s1", metadata: BATCH_CONTEXT }];
    mocks.listArtifacts.mockResolvedValue([{ artifact_id: "w", filename: "written_q1.csv" }]);
    mocks.fetchArtifactContent.mockResolvedValue({ content: "exam_answer_id,score,feedback\na1,8,AI\n" });
    mocks.getBatchGradeWrites.mockResolvedValue([
      { exam_answer_id: "a1", question_id: "q1", score: 8, feedback: "AI", current: false },
    ]);
    const { result } = render([row({ score: 8, feedback: "AI" })]);
    await waitFor(() => expect(result.current.sessionId).toBe("s1"));
    await act(() => result.current.revertQuestion("q1"));
    expect(mocks.ungradeExamAnswer).not.toHaveBeenCalled();
  });
});
