import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSubmission } from "./useSubmission";
import { testRun, getTestRunProgress } from "@/infrastructure/api/repositories/problem.repository";
import { submitSolution, getSubmission } from "@/infrastructure/api/repositories/submission.repository";
vi.mock("@/infrastructure/api/repositories/problem.repository", () => ({ testRun: vi.fn(), getTestRunProgress: vi.fn() }));
vi.mock("@/infrastructure/api/repositories/submission.repository", () => ({ submitSolution: vi.fn(), getSubmission: vi.fn() }));
const props = { problemId: "p1", contestId: "c1", code: "code", language: "cpp" };
beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe.each(["test", "submit"] as const)("%s execution", type => {
  it("shares pending, progressive completion and error transitions", async () => {
    const start = type === "test" ? vi.mocked(testRun) : vi.mocked(submitSolution);
    const poll = type === "test" ? vi.mocked(getTestRunProgress) : vi.mocked(getSubmission);
    start.mockResolvedValue({ id: "run", run_id: "run", status: "pending", total: 4, totalTestCases: 4, results: [] } as never);
    poll.mockResolvedValueOnce({ execution_status: "judging", id: "run", status: "judging", total: 4, totalTestCases: 4, results: [{ status: "AC" }] } as never);
    poll.mockResolvedValueOnce({ execution_status: "complete", id: "run", status: "AC", results: [{ status: "AC" }] } as never);
    const { result } = renderHook(() => useSubmission(props));
    await act(async () => { await result.current.execute(type); });
    expect(result.current.executionState.status).toBe("polling");
    expect(result.current.executionState.result?.total).toBe(4);
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(result.current.executionState.status).toBe("polling");
    expect(result.current.executionState.result?.cases).toHaveLength(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(result.current.executionState.status).toBe("complete");
    start.mockRejectedValueOnce(new Error("Unavailable"));
    await act(async () => { await result.current.execute(type); });
    expect(result.current.executionState.status).toBe("error");
    expect(result.current.executionState.error).toBe("Unavailable");
  });
});

it("ignores an old problem's in-flight result", async () => {
  let resolve!: (value: never) => void;
  vi.mocked(testRun).mockImplementation(() => new Promise(r => { resolve = r; }));
  const { result, rerender } = renderHook(({ problemId }) => useSubmission({ ...props, problemId }), { initialProps: { problemId: "p1" } });
  act(() => { void result.current.execute("test"); });
  rerender({ problemId: "p2" });
  await act(async () => { resolve({ status: "AC", results: [] } as never); });
  expect(result.current.executionState.status).toBe("idle");
});
