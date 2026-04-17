import type { Meta, StoryObj } from "@storybook/react-vite";

import { ChatTopBar } from "../ChatTopBar";

const meta: Meta<typeof ChatTopBar> = {
  title: "features/chatbot/chat-ui/ChatTopBar",
  component: ChatTopBar,
  parameters: {
    docs: {
      description: {
        component: "統一頂部列 — 左：history toggle / 中：session 標題 / 右：新對話 + (可選) 關閉。桌面、手機、sidebar 共用。",
      },
    },
  },
  args: {
    onToggleHistory: () => {},
    onNewChat: () => {},
  },
  argTypes: {
    title: { control: "text" },
    historyOpen: { control: "boolean" },
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 900 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const HistoryClosed: Story = {
  name: "History 關閉",
  args: { title: "新對話", historyOpen: false },
};

export const HistoryOpen: Story = {
  name: "History 開啟",
  args: { title: "列出我的教室", historyOpen: true },
};

export const SidebarMode: Story = {
  name: "Sidebar 模式（含關閉按鈕）",
  args: {
    title: "QJudge AI 助教",
    onClose: () => {},
  },
};

export const NoHistoryToggle: Story = {
  name: "無 History 按鈕",
  args: {
    title: "QJudge AI 助教",
    onToggleHistory: undefined,
  },
};
