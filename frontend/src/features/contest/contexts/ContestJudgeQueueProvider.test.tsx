import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSubmission } from "@/features/problems/hooks/useSubmission";
import {
  getSubmission,
  getSubmissions,
  submitSolution,
} from "@/infrastructure/api/repositories/submission.repository";
import { ContestJudgeQueueProvider } from "./ContestJudgeQueueProvider";

vi.mock("@/infrastructure/api/repositories/problem.repository", () => ({ testRun: vi.fn(), getTestRunProgress: vi.fn() }));
vi.mock("@/infrastructure/api/repositories/submission.repository", () => ({
  submitSolution: vi.fn(),
  getSubmission: vi.fn(),
  getSubmissions: vi.fn(),
}));
vi.mock("@/features/auth/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: 7 } }) }));
const contestValue = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("./useOptionalContest", () => ({ useOptionalContest: () => contestValue.current }));

const refreshStandings = vi.fn();
const wrapper = ({ children }: { children: ReactNode }) => (
  <ContestJudgeQueueProvider>{children}</ContestJudgeQueueProvider>
);
const renderSolver = (problemId = "p1") =>
  renderHook(({ problemId: id }) => useSubmission({ problemId: id, contestId: "c1", code: "x", language: "cpp", customTestCases: [] }), {
    wrapper,
    initialProps: { problemId },
  });
const judge = (status: string) => {
  vi.mocked(submitSolution).mockResolvedValue({ id: "s1", status: "pending", createdAt: "2026-10-18T10:00:00Z", results: [] } as never);
  vi.mocked(getSubmissions).mockResolvedValue({ results: [{ id: "s1", status, problemId: "p1", createdAt: "" }], count: 1 } as never);
  vi.mocked(getSubmission).mockResolvedValue({ id: "s1", status, results: [] } as never);
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  contestValue.current = {
    contest: { id: "c1", problems: [{ id: "cp1", problemId: "p1", label: "B" }] },
    refreshStandings,
  };
});
afterEach(() => { vi.useRealTimers(); });

describe("ContestJudgeQueueProvider", () => {
  it("polls as the signed-in user and refreshes standings when a submission is accepted", async () => {
    judge("AC");
    const { result } = renderSolver();
    await act(async () => { await result.current.execute("submit"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(getSubmissions).toHaveBeenCalledWith(expect.objectContaining({ user: "7" }));
    expect(refreshStandings).toHaveBeenCalledTimes(1);
  });

  it("does not refresh standings for a rejected submission", async () => {
    judge("WA");
    const { result } = renderSolver();
    await act(async () => { await result.current.execute("submit"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(getSubmission).toHaveBeenCalledTimes(1);
    expect(refreshStandings).not.toHaveBeenCalled();
  });
});
