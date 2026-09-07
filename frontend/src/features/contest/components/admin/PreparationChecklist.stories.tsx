import type { Meta, StoryObj } from "@storybook/react-vite";

import type { PreparationChecklistItem } from "@/features/contest/screens/admin/panels/adminOverviewDashboard.model";

import PreparationChecklist from "./PreparationChecklist";

const item = (
  overrides: Partial<PreparationChecklistItem>,
): PreparationChecklistItem => ({
  key: "schedule",
  level: "done",
  title: "考試時間",
  description: "2026/09/08 09:00 - 11:00",
  actionLabel: "設定時間",
  ...overrides,
});

const meta = {
  title: "features/contest/admin/PreparationChecklist",
  component: PreparationChecklist,
  args: {
    onItemAction: () => {},
  },
} satisfies Meta<typeof PreparationChecklist>;

export default meta;

type Story = StoryObj<typeof meta>;

export const AllLevels: Story = {
  args: {
    items: [
      item({
        key: "schedule",
        level: "blocking",
        description: "尚未設定，發布前必填",
      }),
      item({
        key: "problems",
        level: "warning",
        title: "題目準備",
        description: "尚未新增題目",
        actionLabel: "前往題目管理",
      }),
      item({
        key: "participants",
        level: "done",
        title: "考生名單",
        description: "已加入 3 人",
        actionLabel: "管理名單",
      }),
    ],
  },
};

export const FullyPrepared: Story = {
  args: {
    items: [
      item({}),
      item({
        key: "problems",
        title: "題目準備",
        description: "已設定 2 題",
        actionLabel: "前往題目管理",
      }),
    ],
  },
};
