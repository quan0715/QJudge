import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
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
      primary,
      resultOverview,
    }: {
      primary?: ReactNode;
      resultOverview?: ReactNode;
    }) => (
      <div>
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
    visibility: "private",
    requiresPassword: true,
    hasJoined: false,
    isRegistered: false,
    participantCount: 5,
    contestType: "coding",
    deliveryMode: "exam",
    countsTowardGrade: true,
    cheatDetectionEnabled: true,
    scoreboardVisibleDuringContest: false,
    allowMultipleJoins: false,
    maxCheatWarnings: 3,
    allowAutoUnlock: false,
    autoUnlockMinutes: 0,
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

const renderScreen = (initialEntry: string) =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AdminOverviewScreen contestId="contest-1" contest={mockState.contest} />
      <LocationProbe />
    </MemoryRouter>,
  );

describe("AdminOverviewScreen", () => {
  it("renders a single overview dashboard and ignores the legacy view query param", () => {
    mockState.contest = contest();

    renderScreen("/contest/contest-1/admin?panel=overview&view=live");

    expect(screen.getByTestId("live-dashboard")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "管理總覽" }),
    ).toBeInTheDocument();
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
});
