import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AdminPreparationDashboardData } from "@/features/contest/screens/admin/panels/adminOverviewDashboard.model";
import AdminPreparationDashboard from "./AdminPreparationDashboard";

vi.mock("@carbon/charts-react", () => ({
  LineChart: () => <div data-testid="priority-events-chart" />,
}));

vi.mock("@/shared/ui/theme/ThemeContext", () => ({
  useTheme: () => ({ theme: "white" }),
}));

const data: AdminPreparationDashboardData = {
  timeline: {
    phaseLabel: "尚未開始",
    primaryTimeLabel: "距離開始 2:00:00",
    timeWindowLabel: "09:00-11:00",
    startDateTimeLabel: "2026/05/04 09:00",
    endDateTimeLabel: "2026/05/04 11:00",
    progressPercent: 0,
  },
  railItems: [
    { key: "status", label: "競賽狀態", value: "已發布", tone: "neutral" },
    { key: "work_items", label: "考卷題目", value: "12", tone: "neutral" },
    { key: "participants", label: "參賽者", value: "40", tone: "neutral" },
    { key: "anti_cheat", label: "防作弊", value: "已啟用", tone: "neutral" },
    { key: "results", label: "成績", value: "未發布", tone: "warning" },
  ],
  insightCards: [
    {
      key: "grading_progress",
      title: "批改進度",
      value: "75%",
      kind: "progress",
      progressPercent: 75,
      series: [],
    },
    {
      key: "exam_progress",
      title: "考試進度",
      value: "0%",
      kind: "progress",
      progressPercent: 0,
      series: [],
    },
    {
      key: "priority_events",
      title: "違規事件",
      value: "0",
      kind: "line",
      series: [],
    },
  ],
  summaryItems: [
    {
      key: "status",
      label: "競賽狀態",
      value: "已發布",
      description: "已開放給參賽者",
      tone: "neutral",
    },
    {
      key: "schedule",
      label: "考試時段",
      value: "09:00-11:00",
      description: "時間設定完整",
      tone: "neutral",
    },
    {
      key: "work_items",
      label: "考卷題目",
      value: "12",
      description: "內容已建立",
      tone: "neutral",
    },
    {
      key: "participants",
      label: "參賽者",
      value: "40",
      description: "名單可供管理",
      tone: "neutral",
    },
    {
      key: "grading",
      label: "批改進度",
      value: "75%",
      description: "30 / 40 份",
      tone: "warning",
    },
    {
      key: "results",
      label: "成績",
      value: "未發布",
      description: "確認批改後發布",
      tone: "warning",
    },
  ],
  checklistItems: [
    {
      key: "publish",
      label: "競賽發布",
      status: "done",
      statusLabel: "完成",
      description: "參賽者可依權限進入競賽",
    },
    {
      key: "rules",
      label: "作答規則",
      status: "warning",
      statusLabel: "待確認",
      description: "可補上考試規則與注意事項",
    },
  ],
  grading: {
    totalAnswers: 40,
    gradedAnswers: 30,
    ungradedAnswers: 10,
    progressPercent: 75,
    progressLabel: "30 / 40",
    resultsLabel: "未發布",
    resultsTone: "warning",
  },
};

describe("AdminPreparationDashboard", () => {
  const primary = <div>競賽資訊</div>;

  it("renders a shared segmented preparation dashboard", () => {
    render(
      <AdminPreparationDashboard
        data={data}
        onOpenPanel={vi.fn()}
        onOpenSettings={vi.fn()}
        primary={primary}
      />,
    );

    expect(screen.getByText("競賽資訊")).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "考試進度" }),
    ).toHaveAttribute("aria-valuenow", "0");
    expect(screen.getByText("違規事件")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "準備狀態" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/監控來源|提交趨勢/)).not.toBeInTheDocument();
  });

  it("opens the matching admin panel entries", async () => {
    const onOpenPanel = vi.fn();
    const onOpenSettings = vi.fn();
    render(
      <AdminPreparationDashboard
        data={data}
        onOpenPanel={onOpenPanel}
        onOpenSettings={onOpenSettings}
        primary={primary}
      />,
    );

    await userEvent.click(screen.getByRole("tab", { name: "管理入口" }));
    await userEvent.click(
      screen.getByRole("button", { name: /題目編輯與管理/ }),
    );
    await userEvent.click(screen.getByRole("button", { name: /參賽者管理/ }));
    await userEvent.click(
      screen.getAllByRole("button", { name: /批改與成績/ })[0],
    );
    await userEvent.click(screen.getByRole("button", { name: /競賽設定/ }));

    expect(onOpenPanel).toHaveBeenNthCalledWith(1, "problem_editor");
    expect(onOpenPanel).toHaveBeenNthCalledWith(2, "participants");
    expect(onOpenPanel).toHaveBeenNthCalledWith(3, "grading");
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it("switches to the grading tab", async () => {
    render(
      <AdminPreparationDashboard
        data={data}
        onOpenPanel={vi.fn()}
        onOpenSettings={vi.fn()}
        primary={primary}
      />,
    );

    await userEvent.click(screen.getByRole("tab", { name: "批改與成績" }));

    expect(
      screen.getByRole("heading", { name: "批改與成績" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("progressbar", { name: "批改進度" })[1],
    ).toHaveAttribute("aria-valuenow", "75");
  });
});
