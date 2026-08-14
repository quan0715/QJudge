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
    isProcessing: true,
    currentToolName: "qjudge_browse",
  },
};

export const WithError: Story = {
  name: "含失敗步驟",
  args: {
    steps: [
      mockToolSteps[0],
      {
        ...mockToolSteps[1],
        state: "error",
        error: {
          code: "run-failed",
          operation: "subscribe-run",
          message: "Permission denied",
          recoverable: false,
        },
      },
    ],
    isProcessing: false,
  },
};
