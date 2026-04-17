import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChainOfThought } from "../ChainOfThought";
import { mockToolSteps } from "./chat-ui.mocks";

const meta: Meta<typeof ChainOfThought> = {
  title: "features/chatbot/chat-ui/ChainOfThought",
  component: ChainOfThought,
  parameters: {
    docs: {
      description: {
        component: "Carbon Accordion 顯示 AI 工具呼叫步驟。每步有狀態 icon（processing / success / failure），可展開查看輸入/輸出。",
      },
    },
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 700, padding: "1rem" }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Completed: Story = {
  name: "全部完成",
  args: {
    steps: mockToolSteps,
    isProcessing: false,
  },
};

export const Processing: Story = {
  name: "執行中",
  args: {
    steps: [mockToolSteps[0]],
    todoItems: [
      { id: "todo-1", label: "讀取題目資料", status: "success" },
      { id: "todo-2", label: "建立測試案例", status: "in_progress" },
      { id: "todo-3", label: "產生參考解答", status: "pending" },
    ],
    isProcessing: true,
    currentToolName: "qjudge_browse",
  },
};

export const WithError: Story = {
  name: "含失敗步驟",
  args: {
    steps: [
      mockToolSteps[0],
      { ...mockToolSteps[1], isError: true, result: "Permission denied" },
    ],
    isProcessing: false,
  },
};
