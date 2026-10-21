import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
  default: {
    getSession: mocks.getSession,
    getActiveRuns: mocks.getActiveRuns,
    startRun: mocks.startRun,
    cancelRun: mocks.cancelRun,
  },
}));
vi.mock("@/infrastructure/api/repositories/examAnswers.repository", () => ({
  ungradeExamAnswer: mocks.ungradeExamAnswer,
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

function render(rows = ROWS, refreshGrades = vi.fn().mockResolvedValue(undefined)) {
  return renderHook(() =>
    useBatchGrading("c1", rows, { resultsPublished: false, refreshGrades }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sessions = [];
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

  it("resume only enqueues unfinished questions with ungraded answers", async () => {
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

    expect(mocks.startRun).toHaveBeenCalledTimes(1);
    expect((mocks.startRun.mock.calls[0][1] as string).split("\n")[0]).toBe("batch_question_id: q2");
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
    const refreshGrades = vi.fn().mockResolvedValue(undefined);
    const rows = [
      row({ id: "a1", questionId: "q1", score: 8, feedback: "AI" }),
      row({ id: "a9", questionId: "q1", score: 7, feedback: "TA 改過" }),
    ];
    const { result } = render(rows, refreshGrades);
    await waitFor(() => expect(result.current.sessionId).toBe("s1"));

    await act(() => result.current.revertQuestion("q1"));

    expect(mocks.ungradeExamAnswer.mock.calls).toEqual([["c1", "a1"]]);
    const rewritten = mocks.uploadUserArtifact.mock.calls.at(-1)?.[1] as File;
    expect(rewritten.name).toBe("written_q1.csv");
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(rewritten);
    });
    expect(text).toContain("a9");
    expect(text).not.toContain("a1");
    expect(refreshGrades).toHaveBeenCalled();
  });
});
