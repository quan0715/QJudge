import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  TaskComplete,
  Security,
  Education,
  Edit,
  Time,
  Send,
  Warning,
  Activity,
  UserMultiple,
  Group,
  Undo,
} from "@carbon/icons-react";
import { ActionWidgetCard } from "./ActionWidgetCard";

const meta: Meta<typeof ActionWidgetCard> = {
  title: "shared/ui/dataCard/ActionWidgetCard",
  component: ActionWidgetCard,
  parameters: {
    docs: {
      description: {
        component:
          "指揮中心風格的 Widget 卡片。顯示標題、數據、CTA 文字，以及一個圓形 action 按鈕。按鈕根據 intent（navigate/toggle/danger）在 hover 時變色。適用於 admin dashboard overview。",
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Navigate: Story = {
  args: {
    title: "題目數量",
    icon: Education,
    actionIcon: Edit,
    actionIntent: "navigate",
    value: 25,
    unit: "題",
    cta: "前往題目管理",
    onClick: () => console.log("navigate"),
  },
  parameters: {
    docs: { description: { story: "導向型（藍色）— 進入管理介面。" } },
  },
};

export const Toggle: Story = {
  args: {
    title: "嚴格考試模式",
    icon: TaskComplete,
    actionIcon: Security,
    actionIntent: "toggle",
    active: true,
    value: "已啟用",
    cta: "停用模式",
    onClick: () => console.log("toggle"),
  },
  parameters: {
    docs: { description: { story: "切換型（綠色）— 功能開關。`active=true` 時按鈕持續顯示淡綠底色。" } },
  },
};

export const Danger: Story = {
  args: {
    title: "競賽狀態",
    icon: TaskComplete,
    actionIcon: Undo,
    actionIntent: "danger",
    value: "已發布",
    cta: "退回草稿",
    onClick: () => console.log("danger"),
  },
  parameters: {
    docs: { description: { story: "風險型（橘色）— 回退或警告相關操作。" } },
  },
};

export const AllIntents: Story = {
  parameters: {
    docs: {
      description: {
        story: "並排展示三種 intent 的視覺差異。Hover 查看不同的色彩回饋。",
      },
    },
  },
  render: () => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "0.875rem", maxWidth: 900 }}>
      <ActionWidgetCard
        title="題目數量"
        icon={Education}
        actionIcon={Edit}
        actionIntent="navigate"
        value={25}
        unit="題"
        cta="前往題目管理"
        onClick={() => {}}
      />
      <ActionWidgetCard
        title="考試批改狀態"
        icon={Time}
        actionIcon={Send}
        actionIntent="toggle"
        value="72%"
        unit="已發布"
        cta="發布成績"
        onClick={() => {}}
      />
      <ActionWidgetCard
        title="違規次數"
        icon={Warning}
        actionIcon={Activity}
        actionIntent="danger"
        active
        value={8}
        valueColor="var(--cds-support-error, #da1e28)"
        unit="次"
        cta="前往事件面板"
        notificationDot
        onClick={() => {}}
      />
    </div>
  ),
};

export const WithNotificationDot: Story = {
  args: {
    title: "違規次數",
    icon: Warning,
    actionIcon: Activity,
    actionIntent: "danger",
    active: true,
    value: 18,
    valueColor: "var(--cds-support-error, #da1e28)",
    unit: "次",
    cta: "前往事件面板",
    notificationDot: true,
    onClick: () => console.log("violations"),
  },
  parameters: {
    docs: {
      description: {
        story: "紅色數字 + 通知圓點 + active 橘色底 — 讓老師 0.1 秒內鎖定需處理的問題。",
      },
    },
  },
};

export const DashboardGrid: Story = {
  parameters: {
    docs: {
      description: {
        story: "模擬完整的 4-column dashboard grid 佈局，含 active 狀態和通知圓點。",
      },
    },
  },
  render: () => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "0.875rem" }}>
      <ActionWidgetCard
        title="競賽狀態"
        icon={TaskComplete}
        actionIcon={Undo}
        actionIntent="danger"
        value="已發布"
        cta="退回草稿"
        onClick={() => {}}
      />
      <ActionWidgetCard
        title="嚴格考試模式"
        icon={TaskComplete}
        actionIcon={Security}
        actionIntent="toggle"
        active
        value="已啟用"
        cta="停用模式"
        onClick={() => {}}
      />
      <ActionWidgetCard
        title="題目數量"
        icon={Education}
        actionIcon={Edit}
        actionIntent="navigate"
        value={25}
        unit="題"
        cta="前往題目管理"
        onClick={() => {}}
      />
      <ActionWidgetCard
        title="考試批改狀態"
        icon={Time}
        actionIcon={Send}
        actionIntent="toggle"
        active
        value="100%"
        unit="已發布"
        cta="撤回發布"
        onClick={() => {}}
      />
      <ActionWidgetCard
        title="違規次數"
        icon={Warning}
        actionIcon={Activity}
        actionIntent="danger"
        active
        value={18}
        valueColor="var(--cds-support-error, #da1e28)"
        unit="次"
        cta="前往事件面板"
        notificationDot
        onClick={() => {}}
      />
      <ActionWidgetCard
        title="參賽者"
        icon={UserMultiple}
        actionIcon={Group}
        actionIntent="navigate"
        value={42}
        unit="人"
        cta="進入參賽者列表"
        onClick={() => {}}
      />
    </div>
  ),
};
