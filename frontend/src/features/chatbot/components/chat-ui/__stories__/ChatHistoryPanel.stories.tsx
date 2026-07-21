import type { Meta, StoryObj } from "@storybook/react-vite";

import { ChatHistoryPanel } from "../ChatHistoryPanel";
import { mockSessions } from "./chat-ui.mocks";

const meta: Meta<typeof ChatHistoryPanel> = {
  title: "features/chatbot/chat-ui/ChatHistoryPanel",
  component: ChatHistoryPanel,
  parameters: {
    docs: {
      description: {
        component: "Chat 全頁任務側欄：固定的新增任務 action entry，加上按最近更新排序的單一任務清單。支援重命名與刪除。",
      },
    },
  },
  args: {
    onSelectSession: () => {},
    onDeleteSession: () => {},
    onRenameSession: () => {},
    onNewTask: () => {},
  },
  decorators: [
    (Story) => (
      <div style={{ width: 280, height: 500, border: "1px solid var(--cds-border-subtle-01)" }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const WithSessions: Story = {
  name: "有對話記錄",
  args: {
    sessions: mockSessions,
    currentSessionId: "session-1",
  },
};

export const Empty: Story = {
  name: "無記錄",
  args: {
    sessions: [],
    currentSessionId: null,
  },
};

export const FlatTaskIndex: Story = {
  name: "單一任務清單",
  args: WithSessions.args,
};
