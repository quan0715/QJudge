import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ContestParticipant } from "@/core/entities/contest.entity";
import type { AdminOverviewDashboardData } from "@/features/contest/screens/admin/panels/adminOverviewDashboard.model";
import type { InsightCardAction } from "./AdminInsightRail";
import AdminOverviewCommandCenter from "./AdminOverviewCommandCenter";

const participantDashboardState = vi.hoisted(() => ({
  data: null,
  loading: false,
  error: "",
  refresh: vi.fn(),
}));

vi.mock("@carbon/charts-react", () => ({
  LineChart: () => <div data-testid="priority-events-chart" />,
  MeterChart: () => <div data-testid="proportional-meter-chart" />,
}));

vi.mock("@/shared/ui/theme/ThemeContext", () => ({
  useTheme: () => ({ theme: "white" }),
}));

vi.mock(
  "@/features/contest/screens/settings/participants/useParticipantDashboard",
  () => ({
    default: vi.fn(() => participantDashboardState),
  }),
);

vi.mock(
  "@/features/contest/components/participants/ParticipantDashboardPane",
  () => ({
    default: () => (
      <div data-testid="participant-dashboard-pane">既有學生詳細資訊</div>
    ),
  }),
);

vi.mock("@/features/contest/screens/settings/ContestLogsScreen", () => ({
  default: ({ embedded }: { embedded?: boolean }) => (
    <div data-testid="embedded-event-log">
      {embedded ? "右側事件紀錄" : "事件紀錄"}
    </div>
  ),
}));

vi.mock("@/infrastructure/api/repositories", () => ({
  downloadParticipantReport: vi.fn(),
  removeParticipant: vi.fn(),
  reopenExam: vi.fn(),
  unlockParticipant: vi.fn(),
  updateParticipant: vi.fn(),
}));

vi.mock("@/shared/contexts/ToastContext", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

// Use a contest window that places "now" roughly in the middle so the
// CountdownProgress component renders during-phase output deterministically.
const COUNTDOWN_START = new Date(Date.now() - 60 * 60 * 1000).toISOString();
const COUNTDOWN_END = new Date(Date.now() + 45 * 60 * 1000).toISOString();

vi.mock("@/features/contest/contexts", () => ({
  useContest: () => ({
    contest: {
      id: "contest-1",
      name: "Mock Contest",
      startTime: COUNTDOWN_START,
      endTime: COUNTDOWN_END,
    },
    refreshContest: vi.fn(),
  }),
  useContestAdmin: () => ({
    refreshAllAdminData: vi.fn(),
    refreshParticipants: vi.fn(),
    refreshExamEvents: vi.fn(),
    examEventsLoading: false,
  }),
}));

const data: AdminOverviewDashboardData = {
  kpis: [
    { key: "online", label: "在線考生", value: "96 / 128", tone: "neutral" },
    { key: "started", label: "已開始", value: "104", tone: "neutral" },
    { key: "submitted", label: "已交卷", value: "21", tone: "neutral" },
    { key: "locked", label: "鎖定", value: "3", tone: "danger" },
    { key: "attention", label: "待處理事件", value: "5", tone: "warning" },
  ],
  timeline: {
    phaseLabel: "進行中",
    primaryTimeLabel: "剩餘 45:00",
    timeWindowLabel: "09:00-11:00",
    startDateTimeLabel: "2026/05/04 09:00",
    endDateTimeLabel: "2026/05/04 11:00",
    progressPercent: 62,
  },
  railItems: [
    { key: "online", label: "在線", value: "96 / 128", tone: "neutral" },
    { key: "in_progress", label: "作答中", value: "80", tone: "neutral" },
    { key: "not_started", label: "未開始", value: "20", tone: "warning" },
    { key: "submitted", label: "已交卷", value: "21", tone: "neutral" },
    {
      key: "locked_offline",
      label: "鎖定 / 離線",
      value: "3 / 4",
      tone: "danger",
    },
  ],
  insightCards: [
    {
      key: "grading_progress",
      title: "批改進度",
      value: "82%",
      kind: "progress",
      progressPercent: 82,
      series: [],
    },
    {
      key: "exam_progress",
      title: "考試進度",
      value: "62%",
      kind: "progress",
      progressPercent: 62,
      series: [],
    },
    {
      key: "priority_events",
      title: "違規事件",
      value: "3",
      kind: "line",
      series: [
        { key: "p0", label: "P0", values: [{ label: "10:00", value: 1 }] },
        { key: "p1", label: "P1", values: [{ label: "10:00", value: 1 }] },
        { key: "p2", label: "P2", values: [{ label: "10:00", value: 1 }] },
      ],
    },
  ],
  attentionRows: [
    {
      id: "1",
      userId: "1",
      studentName: "王小明",
      kind: "locked",
      statusLabel: "鎖定",
      eventLabel: "考試已鎖定",
      timeLabel: "10:12",
      panelTarget: "participants",
    },
  ],
  distribution: [
    { key: "in_progress", label: "作答中", value: 80, percent: 63 },
    { key: "not_started", label: "未開始", value: 20, percent: 16 },
    { key: "submitted", label: "已交卷", value: 21, percent: 16 },
    { key: "locked", label: "鎖定", value: 3, percent: 2 },
    { key: "offline", label: "離線", value: 4, percent: 3 },
  ],
  examStatus: {
    timeWindowLabel: "09:00-11:00",
    remainingLabel: "45m",
    timeProgressPercent: 62,
    resultsLabel: "未發布",
    gradingLabel: "82%",
    workItemLabel: "考卷題目",
    workItemCount: 12,
  },
  recentEvents: [
    {
      id: "e1",
      label: "auto_submit",
      studentName: "陳小華",
      timeLabel: "10:08",
      tone: "neutral",
    },
  ],
  nextActions: [
    {
      key: "attention",
      title: "處理異常",
      description: "1 位考生需要確認",
      panelTarget: "participants",
    },
    {
      key: "grading",
      title: "前往批改",
      description: "已批改 82%",
      panelTarget: "grading",
    },
    {
      key: "results",
      title: "發布成績",
      description: "確認批改後發布",
      panelTarget: "grading",
    },
  ],
};

const participants: ContestParticipant[] = [
  {
    userId: "1",
    username: "ming",
    displayName: "王小明",
    connectionStatus: "online",
    liveMonitoringOnline: true,
    score: 82,
    joinedAt: "2026-05-03T09:00:00+08:00",
    examStatus: "locked",
    assignmentState: "accepted",
    violationCount: 2,
  },
  {
    userId: "2",
    username: "hua",
    displayName: "陳小華",
    connectionStatus: "offline",
    score: 74,
    joinedAt: "2026-05-03T09:00:00+08:00",
    examStatus: "submitted",
    assignmentState: "submitted",
    violationCount: 0,
  },
] as ContestParticipant[];

describe("AdminOverviewCommandCenter", () => {
  const primary = <div>競賽資訊</div>;
  const questionStatsGallery = <div>各題作答數據</div>;
  const renderCommandCenter = ({
    onOpenPanel = vi.fn(),
    overrideData = data,
    adminLoading = false,
    gradingLoading = false,
    antiCheatEnabled = true,
    gradingAction,
  }: {
    onOpenPanel?: (panel: string) => void;
    overrideData?: AdminOverviewDashboardData;
    adminLoading?: boolean;
    gradingLoading?: boolean;
    antiCheatEnabled?: boolean;
    gradingAction?: InsightCardAction;
  } = {}) =>
    render(
      <AdminOverviewCommandCenter
        data={overrideData}
        adminLoading={adminLoading}
        gradingLoading={gradingLoading}
        contestId="contest-1"
        antiCheatEnabled={antiCheatEnabled}
        onOpenPanel={onOpenPanel}
        participants={participants}
        primary={primary}
        overviewInfo={{ contestTypeLabel: "考卷" }}
        questionStatsGallery={questionStatsGallery}
        gradingAction={gradingAction}
      />,
    );

  it("renders contest information, insight charts, and merged overview panels", () => {
    renderCommandCenter();

    expect(screen.getByText("競賽資訊")).toBeInTheDocument();
    const contestInfo = screen.getByLabelText("競賽基本資訊");
    expect(within(contestInfo).getByText("考卷題型")).toBeInTheDocument();
    expect(within(contestInfo).getByText("考卷")).toBeInTheDocument();
    expect(within(contestInfo).getByText("題目數量")).toBeInTheDocument();
    expect(within(contestInfo).getByText("12")).toBeInTheDocument();
    expect(within(contestInfo).getByText("開始時間")).toBeInTheDocument();
    expect(within(contestInfo).getByText("09:00")).toBeInTheDocument();
    expect(within(contestInfo).getByText("結束時間")).toBeInTheDocument();
    expect(within(contestInfo).getByText("11:00")).toBeInTheDocument();
    expect(
      contestInfo.compareDocumentPosition(screen.getByText("考生列表")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const examSummary = screen.getByLabelText("考試狀態摘要");
    expect(within(examSummary).getByText("考試人數")).toBeInTheDocument();
    expect(within(examSummary).getByText("2")).toBeInTheDocument();
    expect(within(examSummary).getByText("在線人數")).toBeInTheDocument();
    expect(within(examSummary).getByText("1")).toBeInTheDocument();
    expect(within(examSummary).getByText("剩餘時間")).toBeInTheDocument();
    expect(screen.getAllByText("批改進度").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("progressbar", { name: "時間進度" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("違規事件").length).toBeGreaterThan(0);
    const distributionOverview = screen.getByLabelText("學生作答進度");
    expect(distributionOverview).toBeInTheDocument();
    expect(
      within(distributionOverview).getByTestId("proportional-meter-chart"),
    ).toBeInTheDocument();
    expect(
      within(distributionOverview).queryByRole("progressbar", {
        name: "作答進度",
      }),
    ).not.toBeInTheDocument();
    expect(
      within(distributionOverview).queryByText("離線"),
    ).not.toBeInTheDocument();
    const eventLogPanel = screen.getByLabelText("事件紀錄");
    const priorityChartTitle = within(eventLogPanel).getByText("違規事件");
    const embeddedEventLog = screen.getByTestId("embedded-event-log");
    expect(
      priorityChartTitle.compareDocumentPosition(embeddedEventLog) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen.queryByRole("tab", { name: "監考總覽" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "準備與批改" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "管理入口" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("考生列表")).toBeInTheDocument();
    expect(screen.getByText("王小明")).toBeInTheDocument();
    expect(screen.getByText("@ming")).toBeInTheDocument();
    expect(screen.getByText("陳小華")).toBeInTheDocument();
    expect(screen.queryByText("考務事件")).not.toBeInTheDocument();
    expect(screen.queryByText("競賽發布")).not.toBeInTheDocument();
    expect(screen.getByText("各題作答數據")).toBeInTheDocument();
    expect(screen.queryByText("批改與成績")).not.toBeInTheDocument();
    expect(screen.getByTestId("embedded-event-log")).toHaveTextContent(
      "右側事件紀錄",
    );
    expect(screen.queryByText("30 / 40")).not.toBeInTheDocument();
    expect(screen.queryByText("待批改")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "待處理考生" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "考生分布" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("下一步")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/webcam|screen share|fullscreen|監控來源/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/提交趨勢|submission trend/i),
    ).not.toBeInTheDocument();
  });

  it("keeps online headcount visible when anti-cheat is disabled", () => {
    renderCommandCenter({ antiCheatEnabled: false });

    const examSummary = screen.getByLabelText("考試狀態摘要");
    expect(within(examSummary).getByText("在線人數")).toBeInTheDocument();
    expect(within(examSummary).getByText("1")).toBeInTheDocument();
    expect(within(examSummary).queryByText("違規事件")).not.toBeInTheDocument();
  });

  it("keeps only essential drilldown content in the left overview column", () => {
    renderCommandCenter();

    expect(screen.getByLabelText("學生作答進度")).toBeInTheDocument();
    expect(screen.queryByText("auto_submit")).not.toBeInTheDocument();
    expect(screen.getByText("陳小華")).toBeInTheDocument();
    expect(screen.queryByText("競賽發布")).not.toBeInTheDocument();
    expect(screen.getByText("各題作答數據")).toBeInTheDocument();
    expect(
      screen
        .getAllByRole("progressbar", { name: "批改進度" })
        .some((bar) => bar.getAttribute("aria-valuenow") === "82"),
    ).toBe(true);
    expect(screen.queryByText("題目統計")).not.toBeInTheDocument();
  });

  it("shows the publish results action under grading progress", async () => {
    const onPublishResults = vi.fn();

    renderCommandCenter({
      gradingAction: {
        label: "發布成績",
        onClick: onPublishResults,
      },
    });

    await userEvent.click(screen.getByRole("button", { name: "發布成績" }));

    expect(onPublishResults).toHaveBeenCalledTimes(1);
  });

  it("groups participants by status and switches the card metric", async () => {
    renderCommandCenter();

    expect(screen.getByText("需要處理")).toBeInTheDocument();
    expect(screen.getAllByText("已交卷").length).toBeGreaterThan(0);

    const lockedCard = screen.getByRole("button", { name: /王小明/ });
    expect(within(lockedCard).getByText("分數")).toBeInTheDocument();
    expect(within(lockedCard).getByText("82.00")).toBeInTheDocument();
    expect(within(lockedCard).queryByText("異常事件")).not.toBeInTheDocument();
    expect(within(lockedCard).getByText("@ming")).toBeInTheDocument();
    expect(within(lockedCard).getByText("在線")).toBeInTheDocument();
    const metricSwitch = screen.getByLabelText("考生卡片資料切換");

    await userEvent.click(within(metricSwitch).getByText("異常事件"));

    expect(within(lockedCard).getByText("異常事件")).toBeInTheDocument();
    expect(within(lockedCard).getByText("2")).toBeInTheDocument();

    await userEvent.click(within(metricSwitch).getByText("作答進度"));

    expect(within(lockedCard).getByText("作答進度")).toBeInTheDocument();
    expect(within(lockedCard).getByText("中斷")).toBeInTheDocument();
    expect(within(lockedCard).getByText("已鎖定")).toBeInTheDocument();

    const offlineCard = screen.getByRole("button", { name: /陳小華/ });
    expect(within(offlineCard).getByText("離線")).toBeInTheDocument();
    expect(within(offlineCard).getByLabelText("離線")).toBeInTheDocument();
    expect(within(offlineCard).getByText("@hua")).toBeInTheDocument();
  });

  it("filters participant cards from the overview tab search", async () => {
    renderCommandCenter();

    const searchInput = screen.getByRole("searchbox", { name: "搜尋考生" });
    await userEvent.type(searchInput, "hua");

    expect(
      screen.queryByRole("button", { name: /王小明/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /陳小華/ })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "篩選狀態" }),
    ).toBeInTheDocument();
  });

  it("switches the drilldown section between participants and answer distribution", async () => {
    renderCommandCenter();

    expect(screen.getByRole("tab", { name: "參與者" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tabpanel")).toHaveTextContent("考生列表");

    await userEvent.click(screen.getByRole("tab", { name: "作答分佈" }));

    expect(screen.getByRole("tab", { name: "作答分佈" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tabpanel")).toHaveTextContent("各題作答數據");
  });

  it("opens existing participant detail content from student cards", async () => {
    const onOpenPanel = vi.fn();
    renderCommandCenter({ onOpenPanel });

    await userEvent.click(screen.getByRole("button", { name: /王小明/ }));

    expect(
      screen.getByRole("dialog", { name: "學生詳細資訊" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("participant-dashboard-pane")).toHaveTextContent(
      "既有學生詳細資訊",
    );
    expect(onOpenPanel).not.toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole("button", { name: "關閉學生詳細資訊" }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "學生詳細資訊" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("shows independent skeleton regions for admin and grading API data", () => {
    renderCommandCenter({ adminLoading: true, gradingLoading: true });

    expect(screen.getByLabelText("考生列表載入中")).toBeInTheDocument();
    expect(screen.getByLabelText("批改資料載入中")).toBeInTheDocument();
    expect(screen.getByLabelText("學生作答進度")).toBeInTheDocument();
  });

  it("keeps generic panel entries out of the live dashboard", () => {
    const onOpenPanel = vi.fn();
    renderCommandCenter({
      onOpenPanel,
      overrideData: {
        ...data,
        nextActions: [
          ...data.nextActions,
          {
            key: "results",
            title: "發布成績",
            description: "成績已發布",
            panelTarget: "grading",
            disabled: true,
          },
        ],
      },
    });

    expect(
      screen.queryByRole("button", { name: /即時監控/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /題目編輯與管理/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /參賽者管理/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("管理操作")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /發布成績/ }),
    ).not.toBeInTheDocument();
    expect(onOpenPanel).not.toHaveBeenCalled();
  });
});
