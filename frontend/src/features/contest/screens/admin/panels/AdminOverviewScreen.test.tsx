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
}));

vi.mock("@/features/contest/contexts", () => ({
  useContest: () => ({
    contest: createMockContest({ status: "draft", isClassroomBound: true }),
    refreshContest: mocks.refreshContest,
  }),
  useContestAdmin: () => ({ participants: [], examEvents: [], overviewMetrics: null }),
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
