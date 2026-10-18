import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSubmission } from "@/features/problems/hooks/useSubmission";
import {
  getSubmission,
  getSubmissions,
  submitSolution,
} from "@/infrastructure/api/repositories/submission.repository";
import { JudgeQueueProvider } from "./JudgeQueueProvider";
import { useWatchProblem } from "./useJudgeQueue";
import { summarizeProblemStatuses, type JudgedEvent, type JudgeRun } from "./judgeQueueStore";

vi.mock("@/infrastructure/api/repositories/problem.repository", () => ({ testRun: vi.fn(), getTestRunProgress: vi.fn() }));
vi.mock("@/infrastructure/api/repositories/submission.repository", () => ({
  submitSolution: vi.fn(),
  getSubmission: vi.fn(),
  getSubmissions: vi.fn(),
}));

const T1 = "2026-10-18T10:00:00.000000+08:00";
const T2 = "2026-10-18T10:00:05.000000+08:00";
const base = { contestId: "c1", code: "code", language: "cpp", customTestCases: [] };
const listed = (...rows: Array<{ id: string; status: string }>) =>
  ({ results: rows.map((row) => ({ ...row, problemId: "p", createdAt: T1 })), count: rows.length }) as never;

let onJudged: ReturnType<typeof vi.fn<(event: JudgedEvent) => void>>;
const wrapper = ({ children }: { children: ReactNode }) => (
  <JudgeQueueProvider userId="u1" onJudged={onJudged}>{children}</JudgeQueueProvider>
);
const renderSolver = (problemId = "p1") =>
  renderHook(({ problemId: id }) => {
    useWatchProblem(id, true);
    return useSubmission({ ...base, problemId: id });
  }, {
    wrapper,
    initialProps: { problemId },
  });

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  onJudged = vi.fn();
  vi.mocked(getSubmissions).mockResolvedValue(listed());
});
afterEach(() => { vi.useRealTimers(); });

describe("JudgeQueueProvider", () => {
  it("polls every judging submission with one list request and backs off 0.5, 1, 2, 2 s", async () => {
    vi.mocked(submitSolution)
      .mockResolvedValueOnce({ id: "s1", status: "pending", createdAt: T1, results: [] } as never)
      .mockResolvedValueOnce({ id: "s2", status: "pending", createdAt: T2, results: [] } as never);
    vi.mocked(getSubmissions).mockResolvedValue(listed({ id: "s1", status: "judging" }, { id: "s2", status: "judging" }));
    const { result, rerender } = renderSolver();
    await act(async () => { await result.current.execute("submit"); });
    rerender({ problemId: "p2" });
    await act(async () => { await result.current.execute("submit"); });

    await act(async () => { await vi.advanceTimersByTimeAsync(499); });
    expect(getSubmissions).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(getSubmissions).toHaveBeenCalledTimes(1);
    expect(getSubmissions).toHaveBeenCalledWith({ contest: "c1", user: "u1", created_after: T1, page_size: 100 });
    for (const [delay, calls] of [[1000, 2], [2000, 3], [2000, 4]]) {
      await act(async () => { await vi.advanceTimersByTimeAsync(delay - 1); });
      expect(getSubmissions).toHaveBeenCalledTimes(calls - 1);
      await act(async () => { await vi.advanceTimersByTimeAsync(1); });
      expect(getSubmissions).toHaveBeenCalledTimes(calls);
    }
    expect(getSubmission).not.toHaveBeenCalled();
  });

  it("fetches the detail once when a submission finishes and stops polling", async () => {
    vi.mocked(submitSolution).mockResolvedValue({ id: "s1", status: "pending", createdAt: T1, results: [] } as never);
    vi.mocked(getSubmissions).mockResolvedValue(listed({ id: "s1", status: "AC" }));
    vi.mocked(getSubmission).mockResolvedValue({ id: "s1", status: "AC", score: 100, results: [{ status: "AC" }], totalTestCases: 1 } as never);
    const { result } = renderSolver();
    await act(async () => { await result.current.execute("submit"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });

    expect(getSubmission).toHaveBeenCalledTimes(1);
    expect(getSubmission).toHaveBeenCalledWith("s1");
    expect(result.current.executionState.status).toBe("complete");
    expect(onJudged).toHaveBeenCalledTimes(1);
    expect(onJudged.mock.calls[0][0].run.status).toBe("complete");
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(getSubmissions).toHaveBeenCalledTimes(1);
    expect(getSubmission).toHaveBeenCalledTimes(1);
  });

  it("marks a pending submission queued and a judging one not", async () => {
    vi.mocked(submitSolution).mockResolvedValue({ id: "s1", status: "pending", createdAt: T1, results: [] } as never);
    vi.mocked(getSubmissions).mockResolvedValue(listed({ id: "s1", status: "judging" }));
    const { result } = renderSolver();
    await act(async () => { await result.current.execute("submit"); });
    expect(result.current.executionState.queued).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(result.current.executionState.queued).toBe(false);
  });

  it("keeps a submission after its problem unmounts and shows it on return", async () => {
    vi.mocked(submitSolution).mockResolvedValue({ id: "s1", status: "pending", createdAt: T1, results: [] } as never);
    vi.mocked(getSubmissions).mockResolvedValue(listed({ id: "s1", status: "WA" }));
    vi.mocked(getSubmission).mockResolvedValue({ id: "s1", status: "WA", results: [{ status: "WA" }], totalTestCases: 1 } as never);
    const { result, rerender } = renderSolver();
    await act(async () => { await result.current.execute("submit"); });
    rerender({ problemId: "p2" });
    expect(result.current.executionState.status).toBe("idle");
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    rerender({ problemId: "p1" });
    expect(result.current.executionState.status).toBe("complete");
    expect(result.current.executionState.result).toMatchObject({ type: "submit", status: "WA" });
  });

  it("keeps an in-flight result with the problem that started it", async () => {
    let resolve!: (value: never) => void;
    vi.mocked(submitSolution).mockImplementation(() => new Promise((r) => { resolve = r; }));
    const { result, rerender } = renderSolver();
    act(() => { void result.current.execute("submit"); });
    rerender({ problemId: "p2" });
    await act(async () => { resolve({ id: "s1", status: "pending", createdAt: T1, results: [] } as never); });
    expect(result.current.executionState.status).toBe("idle");
    rerender({ problemId: "p1" });
    expect(result.current.executionState.status).toBe("polling");
  });

  it("reports onScreen only when the judged run is the one shown on the viewed problem", async () => {
    vi.mocked(submitSolution)
      .mockResolvedValueOnce({ id: "s1", status: "pending", createdAt: T1, results: [] } as never)
      .mockResolvedValueOnce({ id: "s2", status: "pending", createdAt: T2, results: [] } as never);
    vi.mocked(getSubmissions).mockResolvedValueOnce(listed({ id: "s1", status: "AC" }));
    vi.mocked(getSubmission).mockResolvedValue({ id: "s1", status: "AC", results: [] } as never);
    const { result, rerender } = renderSolver();
    await act(async () => { await result.current.execute("submit"); });
    rerender({ problemId: "p2" });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(onJudged.mock.calls[0][0].onScreen).toBe(false);

    vi.mocked(getSubmissions).mockResolvedValueOnce(listed({ id: "s2", status: "AC" }));
    vi.mocked(getSubmission).mockResolvedValue({ id: "s2", status: "AC", results: [] } as never);
    await act(async () => { await result.current.execute("submit"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(onJudged.mock.calls[1][0].onScreen).toBe(true);
  });

  it("shows an older submission again through the judged event", async () => {
    vi.mocked(submitSolution).mockResolvedValue({ id: "s1", status: "pending", createdAt: T1, results: [] } as never);
    vi.mocked(getSubmissions).mockResolvedValue(listed({ id: "s1", status: "AC" }));
    vi.mocked(getSubmission).mockResolvedValue({ id: "s1", status: "AC", results: [] } as never);
    const { testRun } = await import("@/infrastructure/api/repositories/problem.repository");
    vi.mocked(testRun).mockResolvedValue({ run_id: "r1", execution_status: "complete", results: [] } as never);
    const { result } = renderSolver();
    await act(async () => { await result.current.execute("submit"); });
    await act(async () => { await result.current.execute("test"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    const event = onJudged.mock.calls[0][0];
    expect(event.onScreen).toBe(false);
    expect(result.current.executionState.type).toBe("test");
    act(() => { event.show(); });
    expect(result.current.executionState).toMatchObject({ type: "submit", status: "complete" });
  });

  it("keeps waiting when the list omits a tracked submission", async () => {
    vi.mocked(submitSolution).mockResolvedValue({ id: "s1", status: "pending", createdAt: T1, results: [] } as never);
    const { result } = renderSolver();
    await act(async () => { await result.current.execute("submit"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(getSubmissions).toHaveBeenCalledTimes(1);
    expect(getSubmission).not.toHaveBeenCalled();
    expect(result.current.executionState.status).toBe("polling");
  });

  it("retries at the 2 s cap after a failed list request", async () => {
    vi.mocked(submitSolution).mockResolvedValue({ id: "s1", status: "pending", createdAt: T1, results: [] } as never);
    vi.mocked(getSubmissions).mockRejectedValueOnce(new Error("Unavailable"));
    const { result } = renderSolver();
    await act(async () => { await result.current.execute("submit"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(getSubmissions).toHaveBeenCalledTimes(1);
    expect(result.current.executionState.status).toBe("polling");
    expect(result.current.executionState.error).toBeUndefined();
    await act(async () => { await vi.advanceTimersByTimeAsync(1999); });
    expect(getSubmissions).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(getSubmissions).toHaveBeenCalledTimes(2);
  });

  it("shows a failed start as an error and does not poll", async () => {
    vi.mocked(submitSolution).mockRejectedValue(new Error("Device conflict"));
    const { result } = renderSolver();
    await act(async () => { await result.current.execute("submit"); });
    expect(result.current.executionState).toMatchObject({ status: "error", error: "Device conflict" });
    expect(result.current.hasPendingSubmission).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(getSubmissions).not.toHaveBeenCalled();
  });

  it("stops polling after the provider unmounts", async () => {
    vi.mocked(submitSolution).mockResolvedValue({ id: "s1", status: "pending", createdAt: T1, results: [] } as never);
    const { result, unmount } = renderSolver();
    await act(async () => { await result.current.execute("submit"); });
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(getSubmissions).not.toHaveBeenCalled();
  });
});

describe("summarizeProblemStatuses", () => {
  const run = (problemId: string, overrides: Partial<JudgeRun>): JudgeRun => ({
    key: `${problemId}-${Math.random()}`, problemId, contestId: "c1", startedAt: 0,
    type: "submit", status: "complete", result: null, ...overrides,
  });
  const verdict = (status: string) => ({ type: "submit" as const, status, passed: 0, total: 0 });

  it("reports judging while any submission of the problem is still running", () => {
    expect(summarizeProblemStatuses([
      run("p1", { result: verdict("WA") }),
      run("p1", { status: "polling" }),
    ])).toEqual({ p1: "judging" });
  });

  it("reports accepted when any finished submission was accepted", () => {
    expect(summarizeProblemStatuses([
      run("p1", { result: verdict("AC") }),
      run("p1", { result: verdict("WA") }),
    ])).toEqual({ p1: "accepted" });
  });

  it("reports rejected when every finished submission failed", () => {
    expect(summarizeProblemStatuses([run("p1", { result: verdict("WA") })])).toEqual({ p1: "rejected" });
  });

  it("ignores failed starts and test runs", () => {
    expect(summarizeProblemStatuses([
      run("p1", { status: "error" }),
      run("p2", { type: "test", status: "polling" }),
    ])).toEqual({});
  });
});
