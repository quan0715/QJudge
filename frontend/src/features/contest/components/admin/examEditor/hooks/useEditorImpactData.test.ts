import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useEditorImpactData } from "./useEditorImpactData";

vi.mock("@/infrastructure/api/repositories/contestParticipants.repository", () => ({
  getContestParticipants: vi.fn().mockResolvedValue([{ userId: 1 }, { userId: 2 }]),
}));

vi.mock("@/infrastructure/api/repositories/examAnswers.repository", () => ({
  getAllExamAnswersForGrading: vi.fn().mockResolvedValue({
    data: [
      { id: "a1", participantUserId: "1", questionId: "q1", score: 5 },
      { id: "a2", participantUserId: "2", questionId: "q1", score: null },
      { id: "a3", participantUserId: "1", questionId: "q2", score: 0 },
    ],
    meta: {},
  }),
}));

const questions = [
  { id: "q1", order: 0, prompt: "Q1", score: 5 },
  { id: "q2", order: 1, prompt: "Q2", score: 5 },
];

describe("useEditorImpactData", () => {
  it("counts each question's answers once grading data loads", async () => {
    const { result } = renderHook(() => useEditorImpactData("contest-1", questions));

    act(() => result.current.ensureLoaded());

    await waitFor(() =>
      expect(result.current.impactContext.questions.map((q) => q.gradedCount)).toEqual([1, 1]),
    );
    expect(result.current.impactContext.questions.map((q) => q.totalAnswers)).toEqual([2, 1]);
  });
});
