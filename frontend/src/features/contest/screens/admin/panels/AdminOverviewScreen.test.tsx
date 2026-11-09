import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockContest } from "@/shared/mocks/contest.mock";
import AdminOverviewScreen from "./AdminOverviewScreen";

const mocks = vi.hoisted(() => ({
  getExamPaper: vi.fn(),
  updateContest: vi.fn(),
  refreshContest: vi.fn(),
  contest: null as ReturnType<typeof createMockContest> | null,
}));

vi.mock("@/features/contest/contexts", () => ({
  useContest: () => ({
    contest: mocks.contest ?? createMockContest({ status: "draft" }),
    refreshContest: mocks.refreshContest,
  }),
  useContestAdmin: () => ({ participants: [], examEvents: [], eventFeed: [], overviewMetrics: null }),
  useAdminPanelRefresh: () => ({ registerPanelRefresh: () => () => {} }),
}));
vi.mock("@/features/contest/screens/settings/grading", () => ({
  useGradingData: () => ({ globalStats: null, loading: false }),
}));
vi.mock("@/features/contest/components/admin/statistics/useContestResultDashboard", () => ({
  useContestResultDashboard: () => ({ data: null, loading: false }),
}));
vi.mock("@/infrastructure/api/repositories", () => ({
  getExamPaper: mocks.getExamPaper,
  updateContest: mocks.updateContest,
}));
vi.mock("@/features/contest/components/admin/statistics/AdminQuestionStatsGallery", () => ({ default: () => null }));
vi.mock("@/features/contest/components/admin/statistics/AdminExamResultOverview", () => ({ default: () => null }));
vi.mock("@/features/contest/screens/settings/grading/GradingMatrixViewScreen", () => ({ default: () => null }));
vi.mock("@/shared/ui/theme/ThemeContext", () => ({ useTheme: () => ({ theme: "white" }) }));
vi.mock("@/features/contest/components/GradeAppealsPanel", () => ({ default: () => null }));
vi.mock("@/features/contest/components/ContestClarifications", () => ({ default: () => null }));
vi.mock("@/features/contest/screens/ContestSubmissionListScreen", () => ({ default: () => null }));
vi.mock("@/features/contest/screens/admin/panels/AdminStandingsScreen", () => ({ default: () => null }));
vi.mock("@/features/contest/screens/settings/ContestLogsScreen", () => ({ default: () => null }));
vi.mock("@/shared/contexts/ToastContext", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

async function publishFromOverview() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <AdminOverviewScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: /確認資訊並發布競賽|Review and publish|adminOverview.preparation.steps.review/ }));
  fireEvent.click(screen.getByRole("button", { name: /^(發布競賽|Publish contest|adminOverview.actions.publishContest)$/ }));
}

describe("overview publication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.contest = null;
    mocks.getExamPaper.mockResolvedValue({ questions: [
      { questionType: "single_choice", prompt: "New question", options: ["Option A", "Option B"], correctAnswer: null, order: 2 },
    ] });
  });

  it("shows paper warnings and lets the teacher cancel without publishing", async () => {
    await publishFromOverview();
    expect(await screen.findByText(/settings.publishCheck.missingAnswer|第 1 題尚未設定正確答案|Question 1: no correct answer set/)).toBeInTheDocument();
    expect(screen.getByText(/settings.publishCheck.defaultContent|第 1 題仍是新增時的預設內容|Question 1: still has placeholder content/)).toBeInTheDocument();
    expect(mocks.updateContest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /取消|Cancel|button.cancel/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: /^(發布競賽|Publish contest|adminOverview.actions.publishContest)$/ })).toBeEnabled());
    expect(mocks.updateContest).not.toHaveBeenCalled();
  });

  it("publishes after the teacher explicitly accepts paper warnings", async () => {
    await publishFromOverview();
    await screen.findByText(/settings.publishCheck.missingAnswer|第 1 題尚未設定正確答案|Question 1: no correct answer set/);
    fireEvent.click(screen.getByRole("button", { name: /仍要發布|Publish anyway|adminOverview.preparation.confirm.publishAnyway/ }));
    await waitFor(() => expect(mocks.updateContest).toHaveBeenCalledWith("contest-001", { status: "published" }));
  });
});

describe("overview drilldown tabs", () => {
  it("no longer offers a participants tab or student QR scan for a running exam", () => {
    mocks.contest = createMockContest({
      status: "published",
      contestType: "paper_exam",
      startTime: new Date(Date.now() - 60_000).toISOString(),
      endTime: new Date(Date.now() + 3_600_000).toISOString(),
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <AdminOverviewScreen />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.queryByRole("tab", { name: /^(參與者|Participants|adminOverview.command.drilldown.participants)$/ })).toBeNull();
    expect(screen.getByRole("tab", { name: /成績總覽|adminOverview.command.drilldown.scoreMatrix/ }))
      .toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("button", { name: /掃描學生 QR|adminOverview.screen.actions.studentQrScan/ })).toBeNull();
  });
});
