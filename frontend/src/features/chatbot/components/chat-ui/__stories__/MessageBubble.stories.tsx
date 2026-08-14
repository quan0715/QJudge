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
        component: "單則 Copilot 訊息泡泡 — 依公開 parts contract 呈現 Markdown、推理與工具步驟。",
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

export const NarrowOverflowStress: Story = {
  name: "AI — 窄面板 overflow stress",
  decorators: [
    (StoryComponent) => (
      <div style={{ width: 320, maxWidth: "100%", overflow: "hidden" }}>
        <StoryComponent />
      </div>
    ),
  ],
  args: {
    message: {
      id: "overflow-stress",
      role: "assistant",
      createdAt: new Date("2026-07-21T00:00:00.000Z"),
      parts: [
        {
          type: "text",
          text: [
            "https://example.com/this-is-a-very-long-unbroken-path-that-must-not-expand-the-chat-panel-beyond-its-container",
            "",
            "| very long heading | another very long heading |",
            "| --- | --- |",
            "| long-table-cell-without-spaces-abcdefghijklmnopqrstuvwxyz | another-long-cell-abcdefghijklmnopqrstuvwxyz |",
            "",
            "```text",
            "const_really_long_identifier_without_breaks_abcdefghijklmnopqrstuvwxyz_abcdefghijklmnopqrstuvwxyz = true;",
            "```",
          ].join("\n"),
        },
      ],
    },
  },
};
