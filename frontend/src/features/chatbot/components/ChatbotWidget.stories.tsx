import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChatbotWidget } from "./ChatbotWidget";

const meta: Meta<typeof ChatbotWidget> = {
  title: "features/chatbot/ChatbotWidget",
  component: ChatbotWidget,
  args: {
    defaultExpanded: false,
  },
  argTypes: {
    defaultExpanded: {
      control: "boolean",
      description: "初始是否展開面板",
    },
  },
  parameters: {
    docs: { description: { component: "AI Chatbot 側邊面板 — 支援會話管理、流式輸出、工具執行。" } },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const DefaultCollapsed: Story = {
  parameters: { docs: { description: { story: "默認狀態 — 右下角浮動按鈕" } } },
  render: (args) => (
    <div style={{ position: "relative", width: "100%", height: "600px", display: "flex", background: "var(--cds-layer-01)" }}>
      <ChatbotWidget defaultExpanded={args.defaultExpanded} />
    </div>
  ),
};

export const ExpandedPanel: Story = {
  parameters: { docs: { description: { story: "展開狀態 — 側邊聊天面板" } } },
  render: () => (
    <div style={{ position: "relative", width: "100%", height: "600px", display: "flex", background: "var(--cds-layer-01)" }}>
      <ChatbotWidget defaultExpanded />
    </div>
  ),
};
