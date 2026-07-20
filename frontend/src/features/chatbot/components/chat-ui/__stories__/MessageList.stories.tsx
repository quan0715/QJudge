import type { Meta, StoryObj } from "@storybook/react-vite";

import { MessageList } from "../MessageList";
import { MessageBubble } from "../MessageBubble";
import {
  mockUserMessage,
  mockAiSimple,
  mockAiWithCoT,
  mockAiWithMarkdown,
} from "./chat-ui.mocks";

const sessionDates = {
  createdAt: new Date("2026-04-17T14:00:00"),
  updatedAt: new Date("2026-04-17T14:03:00"),
};

const meta: Meta<typeof MessageList> = {
  title: "features/chatbot/chat-ui/MessageList",
  component: MessageList,
  parameters: {
    docs: {
      description: {
        component: "訊息列表 slot — 委派 message renderer 並管理 scroll to bottom。HITL 與建議由 CopilotPanel 的 sibling slots 負責。",
      },
    },
  },
  args: {
    messages: [],
    activeSessionId: null,
    activeSession: { status: "empty", id: null, data: null, error: null },
    run: { status: "ready", run: null },
    messageComponent: MessageBubble,
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
      {
        ...mockUserMessage,
        id: "msg-user-2",
        parts: [{ type: "text", text: "列出競賽題目" }],
        createdAt: new Date("2026-04-17T14:02:00"),
      },
      mockAiWithMarkdown,
    ],
    activeSessionId: "session-1",
    activeSession: {
      status: "ready",
      id: "session-1",
      data: {
        id: "session-1",
        title: "列出我的教室",
        messages: [],
        ...sessionDates,
      },
      error: null,
    },
  },
};

export const LoadingHistory: Story = {
  name: "載入歷史訊息",
  args: {
    messages: [],
    activeSessionId: "session-1",
    activeSession: {
      status: "loading",
      id: "session-1",
      data: null,
      error: null,
    },
  },
};

export const Streaming: Story = {
  name: "串流中的對話",
  args: {
    messages: [mockUserMessage, mockAiSimple],
    activeSessionId: "session-1",
    activeSession: Conversation.args!.activeSession,
    run: {
      status: "streaming",
      run: {
        id: "run-1",
        sessionId: "session-1",
        status: "running",
      },
    },
  },
};
