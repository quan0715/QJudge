import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePaperExamSaveOnLeave } from "./usePaperExamSaveOnLeave";
import { submitExamAnswer } from "@/infrastructure/api/repositories/examAnswers.repository";

vi.mock("@/infrastructure/api/repositories/examAnswers.repository", () => ({
  submitExamAnswer: vi.fn().mockResolvedValue({}),
}));

const mockedSubmitExamAnswer = vi.mocked(submitExamAnswer);

describe("usePaperExamSaveOnLeave", () => {
  beforeEach(() => {
    mockedSubmitExamAnswer.mockReset();
    mockedSubmitExamAnswer.mockResolvedValue({} as never);
  });

  it("rejects flushAll when a dirty answer fails to persist", async () => {
    mockedSubmitExamAnswer.mockRejectedValueOnce(new Error("network down"));

    const { result } = renderHook(() =>
      usePaperExamSaveOnLeave({
        contestId: "contest-1",
        answers: { q1: "answer" },
        items: [{ kind: "question", data: { id: "q1", questionType: "essay" } }],
      }),
    );

    act(() => {
      result.current.markDirty("q1");
    });

    await act(async () => {
      await expect(result.current.flushAll()).rejects.toThrow("network down");
    });
    expect(result.current.saveStatus).toBe("error");
  });
});
