import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GradingAnswerRow } from "../gradingTypes";

const mocks = vi.hoisted(() => ({
  ai: {
    resultsByAnswerId: {} as Record<string, { score: number | null; reason: string; synced: boolean }>,
    sessionId: "sess" as string | undefined,
    trackedQuestionId: "q1" as string | undefined,
    error: undefined as string | undefined,
    start: vi.fn(),
    restore: vi.fn(),
    refreshSuggestions: vi.fn(),
    markAnswersSynced: vi.fn(),
    clear: vi.fn(),
  },
  gradeExamAnswer: vi.fn(),
  refreshSessions: vi.fn(),
}));

vi.mock("../useAiQuestionGrading", () => ({
  AI_GRADING_TASK_TYPE: "grading.question",
  useAiQuestionGrading: () => mocks.ai,
}));
vi.mock("@copilot", () => ({
  useCopilotSessions: () => ({
    sessions: [],
    listStatus: "ready",
    activeSession: { id: null, status: "idle" },
    refresh: mocks.refreshSessions,
  }),
  useCopilotRun: () => ({ state: { status: "ready" } }),
}));
vi.mock("@/features/ai-tasks/hooks/useTaskSession", () => ({
  useTaskSession: () => ({ pendingBindSessionId: "", setPendingBindSessionId: vi.fn(), resolving: false }),
}));
vi.mock("@/infrastructure/api/repositories/examAnswers.repository", () => ({
  gradeExamAnswer: mocks.gradeExamAnswer,
}));

import { useQuestionSuggestions } from "./useQuestionSuggestions";

const row = (id: string): GradingAnswerRow =>
  ({ id, questionId: "q1", questionIndex: 3, questionLabel: "3", score: null, feedback: "" }) as GradingAnswerRow;
const ROWS = [row("1"), row("2")];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ai.sessionId = "sess";
  mocks.ai.trackedQuestionId = "q1";
  mocks.ai.resultsByAnswerId = { "1": { score: 4, reason: "ok", synced: false } };
  mocks.ai.markAnswersSynced.mockResolvedValue(true);
  mocks.ai.refreshSuggestions.mockResolvedValue(undefined);
  mocks.gradeExamAnswer.mockResolvedValue({});
});

describe("useQuestionSuggestions", () => {
  it("exposes suggestions of the bound question", () => {
    const { result } = renderHook(() => useQuestionSuggestions("c1", "q1", ROWS));
    expect(result.current.suggestions).toEqual(mocks.ai.resultsByAnswerId);
  });

  it("adopt writes grades then marks synced", async () => {
    const { result } = renderHook(() => useQuestionSuggestions("c1", "q1", ROWS));

    await act(() => result.current.adopt([{ row: ROWS[0], score: 4, feedback: "ok" }]));

    expect(mocks.gradeExamAnswer).toHaveBeenCalledWith("c1", "1", { score: 4, feedback: "ok" });
    expect(mocks.ai.markAnswersSynced).toHaveBeenCalledWith(["1"]);
  });

  it("adopt keeps successful ids synced when one write fails", async () => {
    mocks.gradeExamAnswer.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHook(() => useQuestionSuggestions("c1", "q1", ROWS));

    let error: unknown;
    await act(async () => {
      try {
        await result.current.adopt([
          { row: ROWS[0], score: 4, feedback: "ok" },
          { row: ROWS[1], score: 2, feedback: "x" },
        ]);
      } catch (err) {
        error = err;
      }
    });

    expect(error).toEqual(new Error("boom"));
    expect(mocks.ai.markAnswersSynced).toHaveBeenCalledWith(["1"]);
  });

  it("skip only marks synced", async () => {
    const { result } = renderHook(() => useQuestionSuggestions("c1", "q1", ROWS));

    await act(() => result.current.skip(["1"]));

    expect(mocks.gradeExamAnswer).not.toHaveBeenCalled();
    expect(mocks.ai.markAnswersSynced).toHaveBeenCalledWith(["1"]);
  });

  it("start asks the question grader for suggestions on the given rows", async () => {
    mocks.ai.start.mockResolvedValue("sess-2");
    const { result } = renderHook(() => useQuestionSuggestions("c1", "q1", ROWS));

    await act(() => result.current.start([ROWS[1]], "model-x"));

    expect(mocks.ai.start).toHaveBeenCalledWith("c1", "q1", [ROWS[1]], { modelId: "model-x", title: "AI 建議 · Q3" });
  });

  it("group unit is inert", async () => {
    const { result } = renderHook(() => useQuestionSuggestions("c1", null, ROWS));

    await act(() => result.current.start(ROWS));

    expect(result.current.suggestions).toEqual({});
    expect(mocks.ai.start).not.toHaveBeenCalled();
  });
});
