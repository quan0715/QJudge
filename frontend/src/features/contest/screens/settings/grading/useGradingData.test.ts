import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { useGradingData } from "./useGradingData";
import { getSubmissions } from "@/infrastructure/api/repositories/submission.repository";
import { getAllExamAnswersForGrading } from "@/infrastructure/api/repositories/examAnswers.repository";

vi.mock("react-router-dom", () => ({ useParams: () => ({ contestId: "coding-1" }) }));
const context = vi.hoisted(() => ({ contest: { contestType: "coding", problems: [] }, scoreboardData: null }));
vi.mock("@/features/contest/contexts/ContestContext", () => ({ useContest: () => context }));
vi.mock("@/infrastructure/api/repositories/submission.repository", () => ({
  getSubmissions: vi.fn().mockResolvedValue({ results: [], count: 0 }),
}));
vi.mock("@/infrastructure/api/repositories/examAnswers.repository", () => ({
  getAllExamAnswersForGrading: vi.fn(), gradeExamAnswer: vi.fn(), ungradeExamAnswer: vi.fn(),
}));

describe("paper grading data", () => {
  it("does not load submissions or invent essay answers for coding contests", async () => {
    const { result } = renderHook(() => useGradingData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.answers).toEqual([]);
    expect(getSubmissions).not.toHaveBeenCalled();
    expect(getAllExamAnswersForGrading).not.toHaveBeenCalled();
  });
});
