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
      { id: "gpt-6-luna", displayName: "GPT-6 Luna", description: "OpenAI reasoning" },
      { id: "deepseek-flash", displayName: "DeepSeek V4.1 Flash", description: "reasoning flash", isDefault: true },
    ],
    selectedModelId: "deepseek-flash",
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

export const NoModels: Story = {
  name: "尚未設定模型",
  args: {
    models: [],
    selectedModelId: null,
    disabled: true,
    modelNotice: "此站台尚未設定 AI 模型，請聯絡站台管理員。",
  },
};

export const InvalidModelConfig: Story = {
  name: "模型設定有誤",
  args: {
    models: [],
    selectedModelId: null,
    disabled: true,
    modelNotice: "AI 模型設定有誤，AI 功能暫時無法使用。請聯絡站台管理員檢查 AI 模型設定。",
    onModelNoticeRetry: () => {},
  },
};

export const ModelNotAvailable: Story = {
  name: "所選模型不可用",
  args: {
    modelNotice: "所選模型目前無法使用，模型清單已重新整理，請改選其他模型後再送出。",
  },
};
