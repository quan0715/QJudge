import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/core/types/chatbot.types";
import type { GradingAnswerRow } from "../gradingTypes";

const mocks = vi.hoisted(() => ({
  getExamQuestions: vi.fn(),
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
  runState: { status: "ready", run: null } as { status: string; run: { id: string; sessionId: string; status: string } | null },
}));

vi.mock("@copilot", () => ({
  useCopilotSessions: () => ({
    sessions: mocks.sessions,
    select: mocks.select,
    refresh: mocks.refreshSessions,
  }),
  useCopilotRun: () => ({ state: mocks.runState }),
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

vi.mock("@/infrastructure/api/repositories/examQuestions.repository", () => ({ getExamQuestions: mocks.getExamQuestions }));

import { useBatchGrading } from "./useBatchGrading";

const row = (overrides: Partial<GradingAnswerRow>): GradingAnswerRow =>
  ({
    id: "a1",
    studentUsername: "s1",
    studentId: "s1",
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
  mocks.runState = { status: "ready", run: null };
  mocks.getExamQuestions.mockResolvedValue([1,2,3,4].map(i => ({id: `q${i}`, questionType: "essay", prompt: "題目", explanation: "", score: 10, order: i})));
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
    expect(uploaded).toEqual(expect.arrayContaining([
      ["batch.json", { step: "batch" }],
      ["grade_q1.csv", { step: "batch" }],
      ["grade_q2.csv", { step: "batch" }],
    ]));
    // Questions share one run (one subagent each) so they are graded in parallel.
    expect(mocks.startRun.mock.calls.map(([, prompt]) => (prompt as string).split("\n")[0])).toEqual([
      "batch_question_id: q1,q2",
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
      "batch_question_id: q1,q2",
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

describe("useBatchGrading files", () => {
  it("keeps teacher notes in one notes file and reuses them on later runs", async () => {
    mocks.sessions = [{ id: "s1", metadata: BATCH_CONTEXT }];
    mocks.listArtifacts.mockResolvedValue([
      { artifact_id: "n1", filename: "notes.json", updated_at: "2026-10-24T00:00:00Z" },
    ]);
    mocks.fetchArtifactContent.mockImplementation(async (id: string) =>
      id === "n1" ? { content: JSON.stringify({ question_q1: "loop is worth one point" }) } : { content: "" },
    );
    const { result } = render();
    await waitFor(() => expect(result.current.sessionId).toBe("s1"));

    await act(() => result.current.startQuestion(["q1"]));

    const uploads = mocks.uploadUserArtifact.mock.calls.map(([, file]) => file as File);
    expect(uploads.map((file) => file.name).filter((name) => name.startsWith("note_"))).toEqual([]);
    const context = uploads.find((file) => file.name.startsWith("context_"));
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(context as File);
    });
    expect(JSON.parse(text).teacher_note).toBe("loop is worth one point");
  });
});

describe("useBatchGrading sync", () => {
  it("reloads the batch state as soon as the copilot sees its run change", async () => {
    mocks.sessions = [{ id: "s1", metadata: BATCH_CONTEXT }];
    mocks.runState = { status: "streaming", run: { id: "r1", sessionId: "s1", status: "running" } };
    const { result, rerender } = render();
    await waitFor(() => expect(result.current.sessionId).toBe("s1"));
    await waitFor(() => expect(mocks.getActiveRuns).toHaveBeenCalled());
    mocks.getActiveRuns.mockClear();

    mocks.runState = { status: "ready", run: null };
    rerender();

    await waitFor(() => expect(mocks.getActiveRuns).toHaveBeenCalled());
  });
});

describe("useBatchGrading polling", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("polls slowly when nothing is running", async () => {
    mocks.sessions = [{ id: "s1", metadata: BATCH_CONTEXT }];
    render();
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.getActiveRuns).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(6_000);
    expect(mocks.getActiveRuns).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(mocks.getActiveRuns).toHaveBeenCalledTimes(2);
  });

  it("polls every five seconds while a run is active without re-reading the session", async () => {
    mocks.sessions = [{ id: "s1", metadata: BATCH_CONTEXT }];
    mocks.getSession.mockResolvedValue({ messages: [userMessage("q1", "r1")] });
    mocks.getActiveRuns.mockResolvedValue([{ id: "r1", sessionId: "s1", status: "running" }]);
    render();
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(5_100);
    expect(mocks.getActiveRuns).toHaveBeenCalledTimes(2);
    expect(mocks.getSession).toHaveBeenCalledTimes(1);
  });

  it("re-reads the session once the set of active runs changes", async () => {
    mocks.sessions = [{ id: "s1", metadata: BATCH_CONTEXT }];
    mocks.getSession.mockResolvedValue({ messages: [userMessage("q1", "r1")] });
    mocks.getActiveRuns.mockResolvedValue([{ id: "r1", sessionId: "s1", status: "running" }]);
    render();
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.getSession).toHaveBeenCalledTimes(1);

    mocks.getActiveRuns.mockResolvedValue([]);
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
    mocks.getSession.mockResolvedValue({ messages: [userMessage("q1", "r1"), userMessage("q2", "r2"), { ...userMessage("q1", "chat-run"), content: "Explain this grade" }] });
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

it("regrading one child includes all siblings while protecting manual changes", async () => {
  mocks.sessions = [{ id: "s1", metadata: BATCH_CONTEXT }];
  mocks.getExamQuestions.mockResolvedValue([1,2].map(i => ({id:`q${i}`,groupId:"g",questionType:"essay",prompt:"shared",score:10,order:i})));
  const grouped = [row({id:"a1",questionId:"q1",questionGroupId:"g",score:8,feedback:"AI"}),
    row({id:"a2",questionId:"q2",questionGroupId:"g",score:9,feedback:"teacher"})];
  const reload = vi.fn().mockResolvedValue(grouped);
  mocks.getBatchGradeWrites.mockResolvedValue([
    {question_id:"q1",exam_answer_id:"a1",score:8,feedback:"AI",current:true},
    {question_id:"q2",exam_answer_id:"a2",score:7,feedback:"AI",current:false},
  ]);
  mocks.ungradeExamAnswer.mockImplementation(async () => { grouped[0]={...grouped[0],score:null}; });
  const {result}=render(grouped,reload);
  await waitFor(()=>expect(result.current.sessionId).toBe("s1"));
  await act(()=>result.current.regradeQuestion("q1","keep partial credit"));
  expect(mocks.ungradeExamAnswer.mock.calls.map(call=>call[1])).toEqual(["a1"]);
  const prompt=mocks.startRun.mock.calls[0][1] as string;
  const [unit]=JSON.parse(prompt.split("\n")[1].slice("batch_units: ".length));
  expect(unit.id).toBe("group_g");
  expect(unit.question_ids).toEqual(["q1"]);
  expect(grouped[1].score).toBe(9);
});

it("opens the same versioned group rubric from either child and retains legacy files", async () => {
  const { listQuestionFiles } = await import("./batchGradingApi");
  const files = [
    { filename: "rubric_group_g1_v1.json", step: "batch", updated_at: "2026-01-01" },
    { filename: "rubric_group_g1_v2.json", step: "batch", updated_at: "2026-01-02" },
    { filename: "rubric_q3.md", step: "rubric", updated_at: "2026-01-01" },
    { filename: "grade_q1.csv", step: "batch", updated_at: "2026-01-01" },
  ];
  mocks.listArtifacts.mockResolvedValue(files);
  expect(await listQuestionFiles("s1", "q1", "g1")).toEqual({ rubric: files[1], grade: files[3] });
  expect(await listQuestionFiles("s1", "q2", "g1")).toEqual({ rubric: files[1], grade: null });
  expect(await listQuestionFiles("s1", "q3")).toEqual({ rubric: files[2], grade: null });
});

describe("useBatchGrading single question", () => {
  it("startQuestion enqueues only the requested questions into a new session", async () => {
    mocks.createTaskSession.mockResolvedValue({ sessionId: "s1" });
    const { result } = render();

    await act(() => result.current.startQuestion(["q2"], "model-x"));

    expect(mocks.createTaskSession).toHaveBeenCalledTimes(1);
    expect(mocks.startRun.mock.calls.map(([, prompt]) => (prompt as string).split("\n")[0])).toEqual([
      "batch_question_id: q2",
    ]);
  });

  it("startQuestion reuses the existing session", async () => {
    mocks.sessions = [{ id: "s1", metadata: BATCH_CONTEXT }];
    const { result } = render();
    await waitFor(() => expect(result.current.sessionId).toBe("s1"));

    await act(() => result.current.startQuestion(["q1"]));

    expect(mocks.createTaskSession).not.toHaveBeenCalled();
    expect(mocks.startRun.mock.calls.map(([, prompt]) => (prompt as string).split("\n")[0])).toEqual([
      "batch_question_id: q1",
    ]);
  });

  it("re-selects the session after starting a run so the copilot streams it", async () => {
    mocks.sessions = [{ id: "s1", metadata: BATCH_CONTEXT }];
    const { result } = render();
    await waitFor(() => expect(result.current.sessionId).toBe("s1"));

    await act(() => result.current.startQuestion(["q1"]));

    const lastSelect = Math.max(...mocks.select.mock.invocationCallOrder);
    const lastStart = Math.max(...mocks.startRun.mock.invocationCallOrder);
    expect(lastSelect).toBeGreaterThan(lastStart);
    expect(mocks.select).toHaveBeenLastCalledWith("s1");
  });

  it("startQuestion can open a new session instead of reusing the current one", async () => {
    mocks.sessions = [{ id: "s1", metadata: BATCH_CONTEXT }];
    mocks.createTaskSession.mockResolvedValue({ sessionId: "s2" });
    const { result } = render();
    await waitFor(() => expect(result.current.sessionId).toBe("s1"));

    await act(() => result.current.startQuestion(["q1"], "model-x", { newSession: true }));

    expect(mocks.createTaskSession).toHaveBeenCalledTimes(1);
    expect(mocks.startRun.mock.calls[0][0]).toBe("s2");
    expect(mocks.startRun.mock.calls[0][2]).toMatchObject({ modelOverride: "model-x" });
    await waitFor(() => expect(result.current.sessionId).toBe("s2"));
  });

  it("startQuestion rejects when results are published", async () => {
    const { result } = renderHook(() =>
      useBatchGrading("c1", ROWS, { resultsPublished: true, reloadAnswers: vi.fn().mockResolvedValue(ROWS) }),
    );

    await expect(act(() => result.current.startQuestion(["q1"]))).rejects.toThrow("成績已公布");
    expect(mocks.startRun).not.toHaveBeenCalled();
  });

  it("aiWrittenAnswerIds lists unchanged AI writes only", async () => {
    mocks.sessions = [{ id: "s1", metadata: BATCH_CONTEXT }];
    mocks.listArtifacts.mockResolvedValue([
      { artifact_id: "w", filename: "written_q1.csv", updated_at: "2026-10-22T00:00:00Z" },
    ]);
    mocks.fetchArtifactContent.mockResolvedValue({
      content: "exam_answer_id,score,feedback\n1,8.0,AI\n2,3.0,AI\n",
      contentType: "text/csv",
    });
    const rows = [
      row({ id: "1", questionId: "q1", score: 8, feedback: "AI" }),
      row({ id: "2", questionId: "q1", score: 4, feedback: "TA 改過" }),
    ];
    const { result } = render(rows);

    await waitFor(() => expect([...result.current.aiWrittenAnswerIds]).toEqual(["1"]));
  });
});
