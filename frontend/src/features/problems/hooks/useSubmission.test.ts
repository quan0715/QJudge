import { createElement, type ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { JudgeQueueProvider } from "@/features/problems/contexts/JudgeQueueProvider";
import { useSubmission } from "./useSubmission";
import { testRun, getTestRunProgress } from "@/infrastructure/api/repositories/problem.repository";
import { submitSolution, getSubmissions } from "@/infrastructure/api/repositories/submission.repository";
vi.mock("@/infrastructure/api/repositories/problem.repository", () => ({ testRun: vi.fn(), getTestRunProgress: vi.fn() }));
vi.mock("@/infrastructure/api/repositories/submission.repository", () => ({ submitSolution: vi.fn(), getSubmission: vi.fn(), getSubmissions: vi.fn() }));
const props = { problemId: "p1", contestId: "c1", code: "code", language: "cpp", customTestCases: [] };
const wrapper = ({ children }: { children: ReactNode }) => createElement(JudgeQueueProvider, { userId: "u1" }, children);
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.mocked(getSubmissions).mockResolvedValue({ results: [], count: 0 });
});
afterEach(() => { vi.useRealTimers(); });

it("polls a test run's progress until it completes", async () => {
  vi.mocked(testRun).mockResolvedValue({ run_id: "run", execution_status: "pending", total: 4, results: [] } as never);
  vi.mocked(getTestRunProgress)
    .mockResolvedValueOnce({ execution_status: "judging", run_id: "run", total: 4, results: [{ status: "AC" }] } as never)
    .mockResolvedValueOnce({ execution_status: "complete", run_id: "run", results: [{ status: "AC" }] } as never);
  const { result } = renderHook(() => useSubmission(props), { wrapper });
  await act(async () => { await result.current.execute("test"); });
  expect(result.current.executionState.status).toBe("polling");
  expect(result.current.executionState.result?.total).toBe(4);
  await act(async () => { await vi.advanceTimersByTimeAsync(500); });
  expect(getTestRunProgress).toHaveBeenCalledWith("p1", "run");
  expect(result.current.executionState.status).toBe("polling");
  expect(result.current.executionState.result?.cases).toHaveLength(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(result.current.executionState.status).toBe("complete");
});

it("blocks a second test run on the same problem but allows a second submission", async () => {
  vi.mocked(testRun).mockResolvedValue({ run_id: "run", execution_status: "pending", total: 1, results: [] } as never);
  vi.mocked(getTestRunProgress).mockResolvedValue({ execution_status: "judging", run_id: "run", total: 1, results: [] } as never);
  vi.mocked(submitSolution)
    .mockResolvedValueOnce({ id: "s1", status: "pending", createdAt: "2026-10-18T10:00:00Z", results: [] } as never)
    .mockResolvedValueOnce({ id: "s2", status: "pending", createdAt: "2026-10-18T10:00:01Z", results: [] } as never);
  const { result } = renderHook(() => useSubmission(props), { wrapper });

  await act(async () => { await result.current.execute("test"); });
  expect(result.current.testRunning).toBe(true);
  await act(async () => { await result.current.execute("test"); });
  expect(testRun).toHaveBeenCalledTimes(1);

  await act(async () => { await result.current.execute("submit"); });
  expect(result.current.hasPendingSubmission).toBe(true);
  await act(async () => { await result.current.execute("submit"); });
  expect(submitSolution).toHaveBeenCalledTimes(2);
});

it("sends the custom cases with a test run but not with a submission", async () => {
  vi.mocked(testRun).mockResolvedValue({ execution_status: "complete", status: "AC", results: [] } as never);
  vi.mocked(submitSolution).mockResolvedValue({ id: "s1", status: "AC", results: [] } as never);
  const customTestCases = [{ input: "2 3", expected_output: "5" }];
  const { result } = renderHook(() => useSubmission({ ...props, customTestCases }), { wrapper });

  await act(async () => { await result.current.execute("test"); });
  await act(async () => { await result.current.execute("submit"); });

  expect(vi.mocked(testRun)).toHaveBeenCalledWith("p1", expect.objectContaining({ custom_test_cases: customTestCases }));
  expect(vi.mocked(submitSolution).mock.calls[0][0]).not.toHaveProperty("custom_test_cases");
});
