import { useState, type ComponentProps } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { ComposerBar } from "../ComposerBar";

function StatefulComposerBar(props: ComponentProps<typeof ComposerBar>) {
  const [value, setValue] = useState(props.value);

  return (
    <ComposerBar
      {...props}
      value={value}
      onValueChange={(nextValue) => {
        setValue(nextValue);
        props.onValueChange(nextValue);
      }}
    />
  );
}

const meta: Meta<typeof ComposerBar> = {
  title: "features/chatbot/chat-ui/ComposerBar",
  component: ComposerBar,
  render: (args) => <StatefulComposerBar {...args} />,
  parameters: {
    docs: {
      description: {
        component: "浮動輸入列 — 原生 textarea，IME 友善（中文輸入不觸發送出）。Enter 送出 / Shift+Enter 換行 / 串流中顯示停止按鈕。",
      },
    },
  },
  args: {
    value: "",
    onValueChange: () => {},
    attachments: [],
    onAddAttachments: () => {},
    onRemoveAttachment: () => {},
    onSend: async () => true,
    canSend: true,
    models: [
      { id: "openai-nano", displayName: "gpt-5-nano", description: "fast", isDefault: true },
      { id: "openai-mini", displayName: "gpt-5.4-mini (low)", description: "reasoning low" },
      { id: "openai-mini-medium", displayName: "gpt-5.4-mini (medium)", description: "reasoning medium" },
      { id: "deepseek-v4", displayName: "deepseek-v4", description: "balanced" },
      { id: "deepseek-v4-thinking", displayName: "deepseek-v4 (thinking)", description: "reasoning" },
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
