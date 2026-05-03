import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AdminOverviewDashboardData } from "@/features/contest/screens/admin/panels/adminOverviewDashboard.model";
import AdminOverviewCommandCenter from "./AdminOverviewCommandCenter";

const data: AdminOverviewDashboardData = {
  kpis: [
    { key: "online", label: "在線考生", value: "96 / 128", tone: "neutral" },
    { key: "started", label: "已開始", value: "104", tone: "neutral" },
    { key: "submitted", label: "已交卷", value: "21", tone: "neutral" },
    { key: "locked", label: "鎖定", value: "3", tone: "danger" },
    { key: "attention", label: "待處理事件", value: "5", tone: "warning" },
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

describe("AdminOverviewCommandCenter", () => {
  it("renders teacher overview sections without monitoring sources or submission trends", () => {
    render(<AdminOverviewCommandCenter data={data} onOpenPanel={vi.fn()} />);

    expect(screen.getByText("待處理考生")).toBeInTheDocument();
    expect(screen.getByText("考務狀態")).toBeInTheDocument();
    expect(screen.getByText("考生分布")).toBeInTheDocument();
    expect(screen.getByText("考務事件")).toBeInTheDocument();
    expect(screen.getByText("下一步")).toBeInTheDocument();
    expect(
      screen.queryByText(/webcam|screen share|fullscreen|監控來源/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/提交趨勢|submission trend/i)).not.toBeInTheDocument();
  });

  it("opens the target admin panel from row actions", async () => {
    const onOpenPanel = vi.fn();
    render(<AdminOverviewCommandCenter data={data} onOpenPanel={onOpenPanel} />);

    await userEvent.click(screen.getByRole("button", { name: "處理 王小明" }));

    expect(onOpenPanel).toHaveBeenCalledWith("participants");
  });

  it("renders next step as panel entries only", async () => {
    const onOpenPanel = vi.fn();
    render(
      <AdminOverviewCommandCenter
        data={{
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
        }}
        onOpenPanel={onOpenPanel}
      />,
    );

    expect(screen.getByRole("button", { name: /即時監控/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /題目編輯與管理/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /參賽者管理/ })).toBeInTheDocument();
    expect(screen.queryByText("管理操作")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /發布成績/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /即時監控/ }));
    await userEvent.click(screen.getByRole("button", { name: /題目編輯與管理/ }));
    await userEvent.click(screen.getByRole("button", { name: /參賽者管理/ }));

    expect(onOpenPanel).toHaveBeenNthCalledWith(1, "proctoring");
    expect(onOpenPanel).toHaveBeenNthCalledWith(2, "problem_editor");
    expect(onOpenPanel).toHaveBeenNthCalledWith(3, "participants");
  });
});
