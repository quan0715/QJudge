import type { Meta, StoryObj } from "@storybook/react-vite";

import { ComposerBar } from "../ComposerBar";

const meta: Meta<typeof ComposerBar> = {
  title: "features/chatbot/chat-ui/ComposerBar",
  component: ComposerBar,
  parameters: {
    docs: {
      description: {
        component: "浮動輸入列 — 原生 textarea，IME 友善（中文輸入不觸發送出）。Enter 送出 / Shift+Enter 換行 / 串流中顯示停止按鈕。",
      },
    },
  },
  args: {
    onSend: () => true,
    models: [
      { model_id: "openai-nano", display_name: "gpt-5-nano", description: "fast", is_default: true },
      { model_id: "openai-mini", display_name: "gpt-5.4-mini (low)", description: "reasoning low", is_default: false },
      { model_id: "openai-mini-medium", display_name: "gpt-5.4-mini (medium)", description: "reasoning medium", is_default: false },
      { model_id: "deepseek-v4", display_name: "deepseek-v4", description: "balanced", is_default: false },
      { model_id: "deepseek-v4-thinking", display_name: "deepseek-v4 (thinking)", description: "reasoning", is_default: false },
    ],
    selectedModelId: "openai-nano",
    onModelChange: () => {},
    onStop: () => {},
    isStreaming: false,
    disabled: false,
  },
  argTypes: {
    isStreaming: { control: "boolean", description: "串流中（顯示停止按鈕）" },
    disabled: { control: "boolean", description: "禁用輸入" },
    placeholder: { control: "text" },
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 900, padding: "1rem", position: "relative" }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Streaming: Story = {
  name: "串流中",
  args: { isStreaming: true },
};

export const Disabled: Story = {
  name: "禁用",
  args: { disabled: true },
};

export const WithStatus: Story = {
  name: "含摘要狀態",
  args: {
    sessionNotice: "對話過長，截取摘要中",
  },
};
