import type { Meta, StoryObj } from "@storybook/react-vite";

import { ChatHistoryPanel } from "../ChatHistoryPanel";
import { mockSessions } from "./chat-ui.mocks";

const meta: Meta<typeof ChatHistoryPanel> = {
  title: "features/chatbot/chat-ui/ChatHistoryPanel",
  component: ChatHistoryPanel,
  parameters: {
    docs: {
      description: {
        component: "歷史對話側邊欄 — 依時間分組（今天/昨天/過去 7 天/更早），支援搜尋、重命名、刪除。可選 close 按鈕。",
      },
    },
  },
  args: {
    onSelectSession: () => {},
    onDeleteSession: () => {},
    onRenameSession: () => {},
    onClose: () => {},
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

export const WithCloseButton: Story = {
  name: "含關閉按鈕（overlay 模式）",
  args: {
    sessions: mockSessions,
    currentSessionId: "session-1",
    onClose: () => {},
  },
};
