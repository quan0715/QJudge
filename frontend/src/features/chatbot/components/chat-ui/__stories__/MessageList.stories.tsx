import type { Meta, StoryObj } from "@storybook/react-vite";

import { MessageList } from "../MessageList";
import {
  mockUserMessage,
  mockAiSimple,
  mockAiWithCoT,
  mockAiWithMarkdown,
  mockApprovalRequest,
} from "./chat-ui.mocks";

const meta: Meta<typeof MessageList> = {
  title: "features/chatbot/chat-ui/MessageList",
  component: MessageList,
  parameters: {
    docs: {
      description: {
        component: "訊息列表 — 可捲動的訊息 feed，自動 scroll to bottom。空狀態顯示歡迎訊息。整合 MessageBubble + HITLCard。",
      },
    },
  },
  args: {
    onApprovalDecision: () => {},
    pendingApproval: null,
  },
  decorators: [
    (Story) => (
      <div style={{ position: "relative", height: 500, display: "flex", flexDirection: "column" }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  name: "空（歡迎訊息）",
  args: { messages: [] },
};

export const Conversation: Story = {
  name: "對話流",
  args: {
    messages: [
      mockUserMessage,
      mockAiWithCoT,
      { ...mockUserMessage, id: "msg-user-2", content: "列出競賽題目", timestamp: new Date("2026-04-17T14:02:00") },
      mockAiWithMarkdown,
    ],
  },
};

export const WithApproval: Story = {
  name: "含 HITL 確認卡",
  args: {
    messages: [mockUserMessage, mockAiSimple],
    pendingApproval: mockApprovalRequest,
  },
};
