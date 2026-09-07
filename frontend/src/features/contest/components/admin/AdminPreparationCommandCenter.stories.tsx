import type { Meta, StoryObj } from "@storybook/react-vite";

import type { AdminPreparationOverviewData } from "@/features/contest/screens/admin/panels/adminOverviewDashboard.model";

import AdminPreparationCommandCenter from "./AdminPreparationCommandCenter";

const draftData: AdminPreparationOverviewData = {
  phase: "draft",
  infoCells: [
    { key: "contestType", label: "考卷題型", value: "Coding Test" },
    { key: "problems", label: "題目數量", value: "1" },
    { key: "participants", label: "考生人數", value: "3" },
  ],
  checklist: [
    {
      key: "schedule",
      level: "blocking",
      title: "考試時間",
      description: "尚未設定，發布前必填",
      actionLabel: "設定時間",
    },
    {
      key: "rules",
      level: "warning",
      title: "競賽規則",
      description: "建議補上考試規則與注意事項",
      actionLabel: "開啟設定",
    },
    {
      key: "problems",
      level: "done",
      title: "題目準備",
      description: "已設定 1 題",
      actionLabel: "前往題目管理",
    },
    {
      key: "participants",
      level: "done",
      title: "考生名單",
      description: "已加入 3 人",
      actionLabel: "管理名單",
    },
  ],
  blockingKeys: ["schedule"],
  canPublish: false,
  countdownMs: null,
  participants: [
    { userId: "u1", displayName: "annnnnnnnnnnnn", username: "114705054" },
    { userId: "u2", displayName: "林品儀", username: "114705061" },
    { userId: "u3", displayName: "Ana", username: "114705007" },
  ],
};

const meta = {
  title: "features/contest/admin/AdminPreparationCommandCenter",
  component: AdminPreparationCommandCenter,
  parameters: { layout: "fullscreen" },
  args: {
    header: <div style={{ padding: "1rem 1.5rem" }}>管理總覽</div>,
    publishing: false,
    attendanceCheckEnabled: false,
    onItemAction: () => {},
    onPublishContest: () => {},
    onRevertToDraft: () => {},
    onPreviewAsStudent: () => {},
    onOpenContestHome: () => {},
    onOpenAttendanceProjection: () => {},
  },
} satisfies Meta<typeof AdminPreparationCommandCenter>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Draft: Story = {
  args: { data: draftData },
};

export const Upcoming: Story = {
  args: {
    attendanceCheckEnabled: true,
    data: {
      ...draftData,
      phase: "upcoming",
      canPublish: true,
      blockingKeys: [],
      countdownMs: 26 * 60 * 60 * 1000,
      checklist: draftData.checklist.map((item) =>
        item.key === "schedule"
          ? {
              ...item,
              level: "done" as const,
              description: "2026/09/08 09:00 - 2026/09/08 11:00",
            }
          : item,
      ),
    },
  },
};

export const NoParticipants: Story = {
  args: {
    data: {
      ...draftData,
      participants: [],
      checklist: draftData.checklist.map((item) =>
        item.key === "participants"
          ? {
              ...item,
              level: "warning" as const,
              description: "尚未加入任何考生",
            }
          : item,
      ),
    },
  },
};
