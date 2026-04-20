import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChatTopBar } from "../ChatTopBar";
import { mockSessions } from "./chat-ui.mocks";

const meta: Meta = {
  title: "features/chatbot/chat-ui/ChatTopBar",
  component: ChatTopBar,
  parameters: {
    docs: {
      description: {
        component:
          "以 WorkspaceToolBar 為基底 — full-page（session dropdown + actions）、sidebar（歷史 + 純标题 + actions）。" +
          "Storybook 不掛 WorkspaceProvider，所以這些 story 以 hideAppSidebarExpand 隱藏展開側欄鈕（實際頁面內會顯示）。",
      },
    },
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

export const FullPage: Story = {
  name: "Full-page mode",
  args: {
    mode: "full" as const,
    hideAppSidebarExpand: true,
    title: "如何描述 AI 側邊欄效果",
    sessions: mockSessions,
    currentSessionId: mockSessions[0].id,
    onSelectSession: () => {},
    onNewChat: () => {},
    onRenameSession: () => {},
    onDeleteSession: () => {},
  },
};

export const FullPageWithClose: Story = {
  name: "Full-page + close button (sidebar embed)",
  args: {
    mode: "full" as const,
    hideAppSidebarExpand: true,
    title: "QJudge AI 助教",
    sessions: mockSessions,
    currentSessionId: mockSessions[0].id,
    onSelectSession: () => {},
    onNewChat: () => {},
    onRenameSession: () => {},
    onDeleteSession: () => {},
    onClose: () => {},
  },
};

export const SidebarMode: Story = {
  name: "Sidebar mode（含關閉按鈕）",
  args: {
    mode: "sidebar" as const,
    title: "QJudge AI 助教",
    historyOpen: false,
    onToggleHistory: () => {},
    onNewChat: () => {},
    onClose: () => {},
  },
};
