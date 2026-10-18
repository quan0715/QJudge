import type { ReactNode } from "react";
import { act, fireEvent, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/shared/contexts/ToastContext";
import { useSubmission } from "@/features/problems/hooks/useSubmission";
import { testRun } from "@/infrastructure/api/repositories/problem.repository";
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
const mocks = vi.hoisted(() => ({ contest: null as unknown, navigator: null as unknown, navigate: () => {} }));
vi.mock("./useOptionalContest", () => ({ useOptionalContest: () => mocks.contest }));
vi.mock("./useContestRuntimeNavigator", () => ({ useContestRuntimeNavigator: () => mocks.navigator }));
vi.mock("react-router-dom", () => ({ useNavigate: () => mocks.navigate, useParams: () => ({ classroomId: "cls1" }) }));

const refreshStandings = vi.fn();
const navigate = vi.fn();
const onSelect = vi.fn();
const wrapper = ({ children }: { children: ReactNode }) => (
  <ToastProvider><ContestJudgeQueueProvider>{children}</ContestJudgeQueueProvider></ToastProvider>
);
const renderSolver = () =>
  renderHook(({ problemId }) => useSubmission({ problemId, contestId: "c1", code: "x", language: "cpp", customTestCases: [] }), {
    wrapper,
    initialProps: { problemId: "p1" },
  });
const pending = (id: string) => ({ id, status: "pending", createdAt: "2026-10-18T10:00:00Z", results: [] }) as never;
const judge = (status: string, id = "s1") => {
  vi.mocked(submitSolution).mockResolvedValue(pending(id));
  vi.mocked(getSubmissions).mockResolvedValue({ results: [{ id, status, problemId: "p1", createdAt: "" }], count: 1 } as never);
  vi.mocked(getSubmission).mockResolvedValue({ id, status, results: [] } as never);
};
const tick = () => act(async () => { await vi.advanceTimersByTimeAsync(500); });

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  mocks.navigate = navigate;
  mocks.navigator = {
    coding: true,
    items: [
      { kind: "coding", data: { id: "cp0", problemId: "p0", label: "A" } },
      { kind: "coding", data: { id: "cp1", problemId: "p1", label: "B" } },
    ],
    onSelect,
  };
  mocks.contest = {
    contest: { id: "c1", problems: [{ id: "cp0", problemId: "p0", label: "A" }, { id: "cp1", problemId: "p1", label: "B" }] },
    refreshStandings,
  };
});
afterEach(() => { vi.useRealTimers(); });

describe("ContestJudgeQueueProvider", () => {
  it("polls as the signed-in user and refreshes standings when a submission is accepted", async () => {
    judge("AC");
    const { result } = renderSolver();
    await act(async () => { await result.current.execute("submit"); });
    await tick();
    expect(getSubmissions).toHaveBeenCalledWith(expect.objectContaining({ user: "7" }));
    expect(refreshStandings).toHaveBeenCalledTimes(1);
  });

  it("does not refresh standings for a rejected submission", async () => {
    judge("WA");
    const { result } = renderSolver();
    await act(async () => { await result.current.execute("submit"); });
    await tick();
    expect(getSubmission).toHaveBeenCalledTimes(1);
    expect(refreshStandings).not.toHaveBeenCalled();
  });

  it('toasts "B 題判完：AC" with a 查看 action when the student is elsewhere', async () => {
    judge("AC");
    const { result, rerender } = renderSolver();
    await act(async () => { await result.current.execute("submit"); });
    rerender({ problemId: "p0" });
    await tick();
    expect(screen.getByText("B 題判完：AC")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看" })).toBeInTheDocument();
  });

  it("查看 shows that submission and selects its problem", async () => {
    judge("WA");
    vi.mocked(testRun).mockResolvedValue({ run_id: "r1", execution_status: "complete", results: [] } as never);
    const { result, rerender } = renderSolver();
    await act(async () => { await result.current.execute("submit"); });
    await act(async () => { await result.current.execute("test"); });
    rerender({ problemId: "p0" });
    await tick();
    fireEvent.click(screen.getByRole("button", { name: "查看" }));
    expect(onSelect).toHaveBeenCalledWith(1);
    expect(screen.queryByText("B 題判完：WA")).not.toBeInTheDocument();
    rerender({ problemId: "p1" });
    expect(result.current.executionState).toMatchObject({ type: "submit", status: "complete" });
  });

  it("navigates to the solve path when no coding navigator is registered", async () => {
    mocks.navigator = null;
    judge("AC");
    const { result, rerender } = renderSolver();
    await act(async () => { await result.current.execute("submit"); });
    rerender({ problemId: "p0" });
    await tick();
    fireEvent.click(screen.getByRole("button", { name: "查看" }));
    expect(navigate).toHaveBeenCalledWith("/classrooms/cls1/contest/c1/solve/cp1");
  });

  it("does not toast while the student is looking at that submission", async () => {
    judge("AC");
    const { result } = renderSolver();
    await act(async () => { await result.current.execute("submit"); });
    await tick();
    expect(screen.queryByText("B 題判完：AC")).not.toBeInTheDocument();
    expect(refreshStandings).toHaveBeenCalledTimes(1);
  });

  it("drops the 查看 action after the exam was submitted", async () => {
    mocks.contest = { ...(mocks.contest as object), contest: { id: "c1", examStatus: "submitted", problems: [{ id: "cp1", problemId: "p1", label: "B" }] } };
    judge("WA");
    const { result, rerender } = renderSolver();
    await act(async () => { await result.current.execute("submit"); });
    rerender({ problemId: "p0" });
    await tick();
    expect(screen.getByText("B 題判完：WA")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "查看" })).not.toBeInTheDocument();
  });

  it("toasts an older resubmission that finishes while the newer one is shown", async () => {
    vi.mocked(submitSolution).mockResolvedValueOnce(pending("s1")).mockResolvedValueOnce(pending("s2"));
    vi.mocked(getSubmissions).mockResolvedValue({
      results: [{ id: "s1", status: "WA", problemId: "p1", createdAt: "" }, { id: "s2", status: "judging", problemId: "p1", createdAt: "" }],
      count: 2,
    } as never);
    vi.mocked(getSubmission).mockResolvedValue({ id: "s1", status: "WA", results: [] } as never);
    const { result } = renderSolver();
    await act(async () => { await result.current.execute("submit"); });
    await act(async () => { await result.current.execute("submit"); });
    await tick();
    expect(screen.getByText("B 題判完：WA")).toBeInTheDocument();
    expect(result.current.hasPendingSubmission).toBe(true);
  });
});
