import type { Meta, StoryObj } from "@storybook/react-vite";
import { MessageBubble } from "../MessageBubble";
import {
  mockUserMessage,
  mockAiSimple,
  mockAiWithThinking,
  mockAiWithCoT,
  mockAiStreaming,
  mockAiWithMarkdown,
} from "./chat-ui.mocks";

const meta: Meta<typeof MessageBubble> = {
  title: "features/chatbot/chat-ui/MessageBubble",
  component: MessageBubble,
  parameters: {
    docs: {
      description: {
        component: "單則訊息泡泡 — 根據 role 區分 user（右對齊）/ assistant（左對齊 + WatsonxAi avatar）。支援 Markdown、Thinking、CoT 步驟。",
      },
    },
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 900, padding: "1rem" }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const UserMessage: Story = {
  args: { message: mockUserMessage },
};

export const AiSimple: Story = {
  name: "AI — 純文字 + Markdown",
  args: { message: mockAiSimple },
};

export const AiWithThinking: Story = {
  name: "AI — 推理過程（可展開）",
  args: { message: mockAiWithThinking },
};

export const AiWithChainOfThought: Story = {
  name: "AI — 工具呼叫步驟 (CoT)",
  args: { message: mockAiWithCoT },
};

export const AiStreaming: Story = {
  name: "AI — 串流中（思考動畫）",
  args: { message: mockAiStreaming },
};

export const AiRichMarkdown: Story = {
  name: "AI — 表格 + 程式碼",
  args: { message: mockAiWithMarkdown },
};
