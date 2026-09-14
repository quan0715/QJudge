import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateContest } from "@/infrastructure/api/repositories";
import type {
  ContestDetail,
  ContestOverviewMetrics,
  ContestParticipant,
  ExamEvent,
} from "@/core/entities/contest.entity";
import AdminOverviewScreen from "./AdminOverviewScreen";

const mockState = vi.hoisted(() => ({
  contest: null as ContestDetail | null,
  participants: [] as ContestParticipant[],
  examEvents: [] as ExamEvent[],
  overviewMetrics: null as ContestOverviewMetrics | null,
  refreshContest: vi.fn(),
  refreshAllAdminData: vi.fn(),
  registerPanelRefresh: vi.fn(() => vi.fn()),
}));

vi.mock("@/features/contest/components/admin/KpiCards", () => ({
  default: () => <div data-testid="overview-hero" />,
}));

vi.mock(
  "@/features/contest/components/admin/AdminOverviewCommandCenter",
  () => ({
    default: ({
      header,
      primary,
      resultOverview,
    }: {
      header?: ReactNode;
      primary?: ReactNode;
      resultOverview?: ReactNode;
    }) => (
      <div>
        {header}
        {primary}
        {resultOverview}
        <div data-testid="live-dashboard">考試進行內容</div>
      </div>
    ),
  }),
);

vi.mock(
  "@/features/contest/components/admin/statistics/AdminExamResultOverview",
  () => ({
    default: () => <div data-testid="result-overview">考試總覽</div>,
  }),
);

vi.mock("@/infrastructure/api/repositories/contestExports.repository", () => ({
  exportContestResults: vi.fn(),
}));

vi.mock("@/infrastructure/api/repositories", () => ({
  addContestParticipant: vi.fn(),
  updateContest: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/shared/contexts/ToastContext", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock("@/features/contest/contexts", () => ({
  useContest: () => ({
    contest: mockState.contest,
    refreshContest: mockState.refreshContest,
  }),
  useContestAdmin: () => ({
    participants: mockState.participants,
    examEvents: mockState.examEvents,
    overviewMetrics: mockState.overviewMetrics,
    initialLoading: false,
    refreshAllAdminData: mockState.refreshAllAdminData,
  }),
  useAdminPanelRefresh: () => ({
    registerPanelRefresh: mockState.registerPanelRefresh,
  }),
}));

vi.mock("@/features/contest/screens/settings/grading", () => ({
  useGradingData: () => ({
    globalStats: {
      totalStudents: 0,
      totalParticipants: 0,
      totalQuestions: 0,
      totalAnswers: 0,
      gradedAnswers: 0,
      ungradedAnswers: 0,
      subjectiveTotal: 0,
      subjectiveGraded: 0,
    },
  }),
}));

const contest = (overrides: Partial<ContestDetail> = {}): ContestDetail =>
  ({
    id: "contest-1",
    name: "演算法期中考",
    description: "",
    startTime: "2026-05-03T09:00:00+08:00",
    endTime: "2026-05-03T11:00:00+08:00",
    status: "published",
    attendanceCheckEnabled: true,
    hasJoined: false,
    canParticipate: false,
    participantCount: 5,
    isClassroomBound: true,
    boundClassroomId: "classroom-1",
    contestType: "coding",
    cheatDetectionEnabled: true,
    scoreboardVisibleDuringContest: false,
    allowMultipleJoins: false,
    resultsPublished: false,
    examQuestionsCount: 0,
    isExamMonitored: true,
    requiresFullscreen: true,
    canSubmitExam: true,
    permissions: {
      canSwitchView: true,
      canEditContest: true,
      canToggleStatus: true,
      canDeleteContest: true,
      canPublishProblems: true,
      canViewAllSubmissions: true,
      canViewFullScoreboard: true,
      canManageClarifications: true,
    },
    problems: [
      { id: "p1", problemId: "101", label: "A", title: "A", score: 100 },
    ],
    ...overrides,
  }) as ContestDetail;

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-search">{location.search}</div>;
}

const renderScreen = (
  initialEntry: string,
  props: { onOpenSettings?: (section?: string) => void } = {},
) =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AdminOverviewScreen
        contestId="contest-1"
        contest={mockState.contest}
        {...props}
      />
      <LocationProbe />
    </MemoryRouter>,
  );

const scheduled = {
  startTime: new Date(Date.now() + 3_600_000).toISOString(),
  endTime: new Date(Date.now() + 7_200_000).toISOString(),
};

describe("AdminOverviewScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a single overview dashboard and ignores the legacy view query param", () => {
    mockState.contest = contest();

    renderScreen("/contest/contest-1/admin?panel=overview&view=live");

    expect(screen.getByTestId("live-dashboard")).toBeInTheDocument();
    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.queryByText("演算法期中考")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "重新整理" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "匯出成績" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "競賽設定" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "競賽主頁" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "開啟簽到投屏" }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "題目編輯與管理" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "成績批改" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("管理入口")).not.toBeInTheDocument();
    expect(screen.queryByText("在線考生")).not.toBeInTheDocument();
    expect(screen.queryByText("待處理事件")).not.toBeInTheDocument();
    expect(screen.queryByText("已開始")).not.toBeInTheDocument();
    expect(screen.queryByText("已交卷")).not.toBeInTheDocument();
    expect(screen.queryByText("鎖定")).not.toBeInTheDocument();
    expect(screen.getByTestId("result-overview")).toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "準備與成績" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "考試進行" }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("location-search")).toHaveTextContent(
      "view=live",
    );
  });

  it("disables attendance projection action before QR attendance is enabled", () => {
    mockState.contest = contest({ attendanceCheckEnabled: false });

    renderScreen("/contest/contest-1/admin?panel=overview");

    expect(
      screen.getByRole("button", { name: "開啟簽到投屏" }),
    ).toBeDisabled();
  });

  it("renders three preparation steps without a participant checklist step", () => {
    mockState.contest = contest({ status: "draft", startTime: "", endTime: "" });

    renderScreen("/contest/contest-1/admin?panel=overview");

    expect(screen.getByRole("button", { name: "競賽資訊設定" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "競賽題目設定" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "確認資訊並發布競賽" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "考生名單" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("live-dashboard")).not.toBeInTheDocument();
  });

  it("keeps the command center once the contest is running", () => {
    mockState.contest = contest({
      status: "published",
      startTime: new Date(Date.now() - 60_000).toISOString(),
      endTime: new Date(Date.now() + 60_000).toISOString(),
    });

    renderScreen("/contest/contest-1/admin?panel=overview");

    expect(screen.getByTestId("live-dashboard")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "發布競賽" }),
    ).not.toBeInTheDocument();
  });

  it("opens contest settings from the first preparation card", async () => {
    mockState.contest = contest({ status: "draft", startTime: "", endTime: "" });
    const onOpenSettings = vi.fn();

    renderScreen("/contest/contest-1/admin?panel=overview", { onOpenSettings });
    await userEvent.click(screen.getByRole("button", { name: "競賽資訊設定" }));

    expect(onOpenSettings).toHaveBeenCalledWith("general");
    expect(updateContest).not.toHaveBeenCalled();
  });

  it("keeps publishing disabled until the schedule is set", async () => {
    mockState.contest = contest({ status: "draft", startTime: "", endTime: "" });

    renderScreen("/contest/contest-1/admin?panel=overview");
    await userEvent.click(
      screen.getByRole("button", { name: "確認資訊並發布競賽" }),
    );

    expect(
      screen.getByRole("dialog", { name: "確認資訊並發布競賽" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("請先完成競賽資訊設定，再發布競賽。"),
    ).toHaveFocus();
    expect(screen.getByRole("button", { name: "發布競賽" })).toBeDisabled();
  });

  it("returns focus to the review step after closing its dialog", async () => {
    mockState.contest = contest({ status: "draft", startTime: "", endTime: "" });

    renderScreen("/contest/contest-1/admin?panel=overview");
    const reviewStep = screen.getByRole("button", {
      name: "確認資訊並發布競賽",
    });

    await userEvent.click(reviewStep);
    await userEvent.click(screen.getByRole("button", { name: "返回" }));

    await waitFor(() => expect(reviewStep).toHaveFocus());
  });

  it("publishes when the schedule is set", async () => {
    mockState.contest = contest({ status: "draft", ...scheduled });

    renderScreen("/contest/contest-1/admin?panel=overview");
    await userEvent.click(screen.getByRole("button", { name: "確認資訊並發布競賽" }));
    expect(updateContest).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "發布競賽" }));

    expect(updateContest).toHaveBeenCalledWith("contest-1", {
      status: "published",
    });
  });

  it("asks for confirmation before publishing without problems", async () => {
    mockState.contest = contest({
      status: "draft",
      ...scheduled,
      problems: [],
    });

    renderScreen("/contest/contest-1/admin?panel=overview");
    await userEvent.click(screen.getByRole("button", { name: "確認資訊並發布競賽" }));
    expect(updateContest).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "發布競賽" }));

    expect(updateContest).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: /仍要發布/ }));

    expect(updateContest).toHaveBeenCalledWith("contest-1", {
      status: "published",
    });
  });
});
