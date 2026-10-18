import type { ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { JudgeQueueProvider } from "@/features/problems/contexts/JudgeQueueProvider";
import { testRun } from "@/infrastructure/api/repositories/problem.repository";
import { getSubmission, getSubmissions, submitSolution } from "@/infrastructure/api/repositories/submission.repository";
import type { JudgedEvent } from "@/features/problems/contexts/judgeQueueStore";
import { ProblemFullPageSolve } from "./ProblemFullPageSolve";

vi.mock("@/infrastructure/api/repositories/problem.repository", () => ({ testRun: vi.fn(), getTestRunProgress: vi.fn() }));
vi.mock("@/infrastructure/api/repositories/submission.repository", () => ({
  submitSolution: vi.fn(),
  getSubmission: vi.fn(),
  getSubmissions: vi.fn(),
}));
vi.mock("@/features/auth/hooks/useUserPreferences", () => ({
  useUserPreferences: () => ({ editorFontSize: 14, editorTabSize: 4, updateEditorSettings: vi.fn() }),
}));
vi.mock("@/shared/layout/SolverLayout", () => ({
  SolverLayout: ({ resultPanel }: { resultPanel: ReactNode }) => <div>{resultPanel}</div>,
}));
vi.mock("@/shared/ui/solver", async () => ({
  EditorContent: () => null,
  StatementPanel: () => null,
  ResultPanel: (await vi.importActual<typeof import("@/shared/ui/solver/result/ResultPanel")>("@/shared/ui/solver/result/ResultPanel")).ResultPanel,
}));

const problem = (id: string) => ({
  id,
  title: `Problem ${id}`,
  languageConfigs: [{ language: "cpp", templateCode: "int main() {}", isEnabled: true }],
  testCases: [],
}) as never;
const renderSolve = (id = "p1", onJudged?: (event: JudgedEvent) => void) => {
  const view = (problemId: string) => (
    <JudgeQueueProvider userId="u1" onJudged={onJudged}>
      <ProblemFullPageSolve key={problemId} problem={problem(problemId)} problemLabel="B" contestId="c1" renderSubmissions={() => null} />
    </JudgeQueueProvider>
  );
  const result = render(view(id));
  return { ...result, switchTo: (problemId: string) => result.rerender(view(problemId)) };
};
const toolbarButton = (name: string) =>
  screen.getAllByRole("button", { name }).find((button) => !button.closest('[role="dialog"]'))!;
const submitOnce = async (calls: number) => {
  fireEvent.click(toolbarButton("繳交"));
  await waitFor(() => expect(submitSolution).toHaveBeenCalledTimes(calls));
};

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  vi.mocked(getSubmissions).mockResolvedValue({ results: [], count: 0 });
  vi.mocked(submitSolution).mockImplementation(async () => ({ id: `s${Math.random()}`, status: "pending", createdAt: "2026-10-18T10:00:00Z", results: [] }) as never);
});

describe("ProblemFullPageSolve", () => {
  it("asks before resubmitting while the problem has a judging submission", async () => {
    renderSolve();
    await submitOnce(1);
    expect(screen.queryByText("目前尚有提交在進行中")).not.toBeInTheDocument();

    fireEvent.click(toolbarButton("繳交"));
    expect(await screen.findByText("目前尚有提交在進行中")).toBeInTheDocument();
    expect(screen.getByText("B 題的上一筆提交還在判題，確定要再繳交一次嗎？")).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "取消" }));
    await waitFor(() => expect(screen.queryByText("目前尚有提交在進行中")).not.toBeInTheDocument());
    expect(submitSolution).toHaveBeenCalledTimes(1);

    fireEvent.click(toolbarButton("繳交"));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "繳交" }));
    await waitFor(() => expect(submitSolution).toHaveBeenCalledTimes(2));
  });

  it("submits another problem without asking", async () => {
    const { switchTo } = renderSolve();
    await submitOnce(1);
    switchTo("p2");
    await submitOnce(2);
    expect(screen.queryByText("目前尚有提交在進行中")).not.toBeInTheDocument();
  });

  it("keeps 測試 enabled while a submission is judging", async () => {
    vi.mocked(testRun).mockResolvedValue({ run_id: "r1", execution_status: "pending", total: 1, results: [] } as never);
    renderSolve();
    await submitOnce(1);
    expect(toolbarButton("測試")).toBeEnabled();

    await act(async () => { fireEvent.click(toolbarButton("測試")); });
    await waitFor(() => expect(toolbarButton("測試")).toBeDisabled());
    expect(toolbarButton("繳交")).toBeEnabled();
  });

  it("opens the result panel on the problem's latest run when the student returns", async () => {
    const { switchTo } = renderSolve();
    await submitOnce(1);
    switchTo("p2");
    expect(screen.queryByText("排隊中")).not.toBeInTheDocument();
    switchTo("p1");
    expect(screen.getByText("排隊中")).toBeInTheDocument();
    expect(screen.getByText("這筆提交正在排隊")).toBeInTheDocument();
  });

  const judgeAs = (status: string) => {
    vi.mocked(submitSolution).mockResolvedValue({ id: "s1", status: "pending", createdAt: "2026-10-18T10:00:00Z", results: [] } as never);
    vi.mocked(getSubmissions).mockResolvedValue({ results: [{ id: "s1", status, problemId: "p1", createdAt: "" }], count: 1 } as never);
    vi.mocked(getSubmission).mockResolvedValue({ id: "s1", status, score: 100, results: [], totalTestCases: 0 } as never);
  };

  it("notifies a verdict once the student collapses the result panel", async () => {
    judgeAs("pending");
    const onJudged = vi.fn();
    renderSolve("p1", onJudged);
    await submitOnce(1);
    fireEvent.click(screen.getByRole("button", { name: "收合" }));
    judgeAs("AC");
    await waitFor(() => expect(onJudged).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(onJudged.mock.calls[0][0].onScreen).toBe(false);
  });

  it("opens the result panel on a submission shown from its notification", async () => {
    judgeAs("pending");
    vi.mocked(testRun).mockResolvedValue({ run_id: "r1", execution_status: "complete", results: [] } as never);
    const onJudged = vi.fn();
    renderSolve("p1", onJudged);
    await submitOnce(1);
    await act(async () => { fireEvent.click(toolbarButton("測試")); });
    fireEvent.click(screen.getByRole("button", { name: "收合" }));
    judgeAs("AC");
    await waitFor(() => expect(onJudged).toHaveBeenCalledTimes(1), { timeout: 3000 });
    act(() => { onJudged.mock.calls[0][0].show(); });
    expect(screen.getByText("Accepted")).toBeInTheDocument();
  });
});
