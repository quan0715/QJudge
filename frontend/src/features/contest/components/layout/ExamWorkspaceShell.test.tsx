import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { ExamWorkspaceShell } from "./ExamWorkspaceShell";

const state = vi.hoisted(() => ({ contest: { name: "測驗", contestType: "paper_exam", scoreboardVisibleDuringContest: false, hasJoined: false, examStatus: "not_started", cheatDetectionEnabled: false } }));
vi.mock("../../contexts/ContestContext", () => ({ useContest: () => ({ contest: state.contest }) }));
vi.mock("../../contexts/useContestRuntimeNavigator", () => ({ useContestRuntimeNavigator: () => ({ items: [], activeIndex: 0, answeredIds: new Set(), onSelect: vi.fn() }) }));
vi.mock("@/features/app/components/workspace/WorkspaceTopNav", () => ({ RuntimeNavExtras: () => <span>考試狀態</span> }));
vi.mock("@/features/app/components/UserMenu", () => ({ UserMenu: ({ settingsOnly }: { settingsOnly?: boolean }) => <button type="button">{settingsOnly ? "帳號設定" : "帳號選單"}</button> }));
vi.mock("./ExamQuestionList", () => ({ ExamQuestionList: ({ collapsed }: { collapsed: boolean }) => <span>{collapsed ? "Q1" : "題目詳細列表"}</span> }));
vi.mock("./ExamWorkspacePanels", () => ({ ExamWorkspacePanels: ({ page }: { page: string }) => <h2>{page}</h2> }));
const mount = () => render(<MemoryRouter><ExamWorkspaceShell preview><input aria-label="答案" /></ExamWorkspaceShell></MemoryRouter>);
afterEach(cleanup);

describe("ExamWorkspaceShell", () => {
  it("keeps the same answer element and value across workspace pages", () => {
    mount();
    const answer = screen.getByRole("textbox", { name: "答案" });
    fireEvent.change(answer, { target: { value: "尚未完成的推導" } });
    for (const label of ["考試概覽", "公告", "作答檢查"]) {
      fireEvent.click(screen.getByRole("button", { name: label, exact: true }));
      expect(answer).not.toBeVisible();
    }
    fireEvent.click(screen.getByRole("button", { name: "題目", exact: true }));
    expect(screen.getByRole("textbox", { name: "答案" })).toBe(answer);
    expect(answer).toHaveValue("尚未完成的推導");
  });
  it("keeps the account settings at the foot of the rail for language and theme", () => {
    mount();
    const rail = screen.getByRole("navigation", { name: "考試功能" });
    expect(rail).toContainElement(screen.getByRole("button", { name: "帳號設定" }));
  });
  it("opens the collapsed list with one question-rail click, including after another page", () => {
    mount();
    const list = screen.getByRole("complementary", { name: "題目導覽" });
    const questions = screen.getByRole("button", { name: "題目", exact: true });
    fireEvent.click(screen.getByRole("button", { name: "收合題目列表" }));
    expect(list).toBeVisible();
    expect(list).toHaveAttribute("data-collapsed", "true");
    expect(screen.getByText("Q1")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "展開題目列表" }));
    expect(list).toHaveAttribute("data-collapsed", "false");
    fireEvent.click(screen.getByRole("button", { name: "收合題目列表" }));
    fireEvent.click(screen.getByRole("button", { name: "公告", exact: true }));
    fireEvent.click(questions);
    expect(list).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "收合題目列表" }));
    fireEvent.click(questions);
    expect(list).toBeVisible();
    fireEvent.click(questions);
    expect(list).toBeVisible();
  });
  it("sends the answering overview to the formal overview, which owns ending the exam", () => {
    render(
      <MemoryRouter initialEntries={["/classrooms/c1/contest/x1/solve"]}>
        <Routes>
          <Route path="/classrooms/:classroomId/contest/:contestId/solve" element={<ExamWorkspaceShell><input aria-label="答案" /></ExamWorkspaceShell>} />
          <Route path="/classrooms/:classroomId/contest/:contestId" element={<p>正式概覽</p>} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "考試概覽", exact: true }));
    expect(screen.getByText("正式概覽")).toBeInTheDocument();
  });
  it("hides the way back to the classroom only during a proctored attempt", () => {
    const routes = (entry: string) => (
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/classrooms/:classroomId/contest/:contestId/solve" element={<ExamWorkspaceShell>作答</ExamWorkspaceShell>} />
          <Route path="/classrooms/:classroomId/contest/:contestId" element={<ExamWorkspaceShell dashboard>概覽內容</ExamWorkspaceShell>} />
          <Route path="/classrooms/:classroomId" element={<p>課程頁</p>} />
        </Routes>
      </MemoryRouter>
    );
    state.contest.hasJoined = true;
    state.contest.examStatus = "in_progress";
    state.contest.cheatDetectionEnabled = true;
    for (const entry of ["/classrooms/c1/contest/x1/solve", "/classrooms/c1/contest/x1"]) {
      render(routes(entry));
      expect(screen.queryByRole("button", { name: "返回課程" })).not.toBeInTheDocument();
      cleanup();
    }
    // A practice set without proctoring can be left at any time, even while answering.
    state.contest.cheatDetectionEnabled = false;
    render(routes("/classrooms/c1/contest/x1/solve"));
    fireEvent.click(screen.getByRole("button", { name: "返回課程" }));
    expect(screen.getByText("課程頁")).toBeInTheDocument();
    state.contest.hasJoined = false;
    state.contest.examStatus = "not_started";
  });
  it("drops the questions entry once the exam is over", () => {
    state.contest.hasJoined = true;
    state.contest.examStatus = "submitted";
    render(
      <MemoryRouter initialEntries={["/classrooms/c1/contest/x1"]}>
        <Routes><Route path="/classrooms/:classroomId/contest/:contestId" element={<ExamWorkspaceShell dashboard>概覽內容</ExamWorkspaceShell>} /></Routes>
      </MemoryRouter>,
    );
    expect(screen.queryByRole("button", { name: "題目", exact: true })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "作答檢查", exact: true })).toBeInTheDocument();
    state.contest.hasJoined = false;
    state.contest.examStatus = "not_started";
  });
  it("only exposes standings when the coding exam permits them", () => {
    state.contest.contestType = "coding";
    state.contest.scoreboardVisibleDuringContest = false;
    const { rerender } = mount();
    expect(screen.queryByRole("button", { name: "排行榜" })).not.toBeInTheDocument();
    state.contest.scoreboardVisibleDuringContest = true;
    rerender(<MemoryRouter><ExamWorkspaceShell preview><input aria-label="答案" /></ExamWorkspaceShell></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "排行榜" }));
    expect(screen.getByRole("heading", { name: "standings" })).toBeVisible();
    state.contest.scoreboardVisibleDuringContest = false;
    rerender(<MemoryRouter><ExamWorkspaceShell preview><input aria-label="答案" /></ExamWorkspaceShell></MemoryRouter>);
    expect(screen.queryByRole("button", { name: "排行榜" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "overview" })).toBeVisible();
    state.contest.contestType = "paper_exam";
  });
});
