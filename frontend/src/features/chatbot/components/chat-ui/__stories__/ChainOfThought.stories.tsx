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

const subagentTask = {
  type: "tool" as const,
  toolCallId: "task-1",
  toolName: "task",
  input: { description: "批改 Q3 TCP 三向交握\n逐份閱讀 grade_q3.csv 並填入 score 與 reason" },
};
const subagentChildren = [
  { ...mockToolSteps[0], toolCallId: "child-1", parentToolCallId: "task-1" },
  { ...mockToolSteps[1], toolCallId: "child-2", parentToolCallId: "task-1" },
];

export const SubagentRunning: Story = {
  name: "子代理執行中",
  args: {
    steps: subagentChildren,
    isProcessing: true,
    activeStep: {
      ...subagentTask,
      state: "input-ready",
      activity: {
        text: "已讀取 36 份作答，正在建立評分準則。",
        todos: [
          { id: "1", label: "讀取作答", status: "success" },
          { id: "2", label: "建立 rubric", status: "in_progress" },
        ],
      },
    },
  },
};

export const SubagentCompleted: Story = {
  name: "子代理完成",
  args: {
    steps: [
      { ...subagentTask, state: "output-ready", output: "Q3 已填 36 份，平均 9.1 分" },
      ...subagentChildren,
    ],
    isProcessing: false,
  },
};
