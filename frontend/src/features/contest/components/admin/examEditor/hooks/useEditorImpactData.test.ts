import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useEditorImpactData } from "./useEditorImpactData";

const api = vi.hoisted(() => ({ participants: vi.fn(), answers: vi.fn() }));
vi.mock("@/infrastructure/api/repositories/contestParticipants.repository", () => ({
  getContestParticipants: api.participants,
}));
vi.mock("@/infrastructure/api/repositories/examAnswers.repository", () => ({
  getAllExamAnswersForGrading: api.answers,
}));
const questions = [
  { id: "q1", order: 0, prompt: "Q1", score: 5 },
  { id: "q2", order: 1, prompt: "Q2", score: 5 },
];
const answers = {
  data: [
    { id: "a1", participantUserId: "1", questionId: "q1", score: 0 },
    { id: "a2", participantUserId: "2", questionId: "q1", score: null },
    { id: "a3", participantUserId: "1", questionId: "q2", score: 5 },
    { id: "a4", participantUserId: "3", questionId: "q1", score: 5 },
  ],
  meta: {},
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("useEditorImpactData", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.participants.mockResolvedValue([{ userId: 1 }, { userId: 2 }]);
    api.answers.mockResolvedValue(answers);
  });

  it("distinguishes loading from loaded counts, including all answers the backend regrades", async () => {
    const pending = deferred<typeof answers>();
    api.answers.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useEditorImpactData("contest-1", questions));
    act(() => result.current.ensureLoaded());
    expect(result.current.status).toBe("loading");
    act(() => pending.resolve(answers));
    await waitFor(() => expect(result.current.status).toBe("loaded"));
    expect(result.current.impactContext.questions.map((q) => q.gradedCount)).toEqual([2, 1]);
    expect(result.current.impactContext.questions.map((q) => q.totalAnswers)).toEqual([3, 1]);
    expect(api.answers).toHaveBeenCalledTimes(1);
  });

  it("exposes failure and retries explicitly without an automatic retry loop", async () => {
    api.answers.mockRejectedValueOnce(new Error("offline"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => useEditorImpactData("contest-1", questions));
    act(() => result.current.ensureLoaded());
    await waitFor(() => expect(result.current.status).toBe("error"));
    act(() => result.current.ensureLoaded());
    expect(api.answers).toHaveBeenCalledTimes(1);
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.status).toBe("loaded"));
    expect(api.answers).toHaveBeenCalledTimes(2);
    log.mockRestore();
  });

  it("refreshes cached grades after regrade or mark-pending", async () => {
    const { result } = renderHook(() => useEditorImpactData("contest-1", questions));
    act(() => result.current.ensureLoaded());
    await waitFor(() => expect(result.current.status).toBe("loaded"));
    const pending = deferred<typeof answers>();
    api.answers.mockReturnValue(pending.promise);
    act(() => result.current.refresh());
    expect(result.current.status).toBe("loading");
    act(() => pending.resolve({ ...answers, data: answers.data.map((row) => ({ ...row, score: null })) }));
    await waitFor(() => expect(result.current.status).toBe("loaded"));
    expect(result.current.impactContext.questions.map((q) => q.gradedCount)).toEqual([0, 0]);
    expect(result.current.impactContext.questions.map((q) => q.totalAnswers)).toEqual([3, 1]);
  });

  it("loads a new contest and ignores the old contest's delayed response", async () => {
    const first = deferred<typeof answers>();
    const second = deferred<typeof answers>();
    api.answers.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result, rerender } = renderHook(({ contestId }) => useEditorImpactData(contestId, questions), {
      initialProps: { contestId: "contest-1" },
    });
    act(() => result.current.ensureLoaded());
    rerender({ contestId: "contest-2" });
    act(() => result.current.ensureLoaded());
    act(() => second.resolve({ data: [], meta: {} }));
    await waitFor(() => expect(result.current.status).toBe("loaded"));
    await act(async () => first.resolve(answers));
    expect(result.current.impactContext.questions.map((q) => q.totalAnswers)).toEqual([0, 0]);
    expect(api.answers).toHaveBeenLastCalledWith("contest-2");
  });

  it("ignores a superseded response after refreshing the same contest", async () => {
    const first = deferred<typeof answers>();
    const latest = deferred<typeof answers>();
    api.answers.mockReturnValueOnce(first.promise).mockReturnValueOnce(latest.promise);
    const { result } = renderHook(() => useEditorImpactData("contest-1", questions));
    act(() => result.current.refresh());
    await act(async () => latest.resolve({ data: [], meta: {} }));
    expect(result.current.status).toBe("loaded");
    await act(async () => first.resolve(answers));
    expect(result.current.impactContext.questions.map((q) => q.totalAnswers)).toEqual([0, 0]);
  });

});
