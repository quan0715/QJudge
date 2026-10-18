import type { Meta, StoryObj } from "@storybook/react-vite";
import { ResultsPanel } from "./ResultsPanel";

const meta = {
  title: "shared/ui/solver/result/execution/ResultsPanel",
  component: ResultsPanel,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div style={{ height: "30rem" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ResultsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {
  args: {
    executionState: { type: "test", status: "idle", result: null },
    testCases: [],
  },
};

export const Running: Story = {
  args: {
    executionState: { type: "test", status: "running", result: null },
    testCases: [
      { id: "case-1", input: "1 2", output: "3", isSample: true },
      { id: "case-2", input: "4 5", output: "9" },
    ],
  },
};

export const CompletedWithFailure: Story = {
  args: {
    executionState: {
      type: "test",
      status: "complete",
      result: {
        type: "run",
        passed: 1,
        failed: 1,
        total: 2,
        cases: [
          {
            id: "case-1",
            passed: true,
            status: "AC",
            input: "1 2",
            expectedOutput: "3",
            actualOutput: "3",
            executionTime: 12,
          },
          {
            id: "case-2",
            passed: false,
            status: "WA",
            input: "4 5",
            expectedOutput: "9",
            actualOutput: "8",
            executionTime: 16,
          },
        ],
      },
    },
    testCases: [],
  },
};

export const Judging: Story = {
  args: {
    executionState: {
      type: "submit",
      status: "polling",
      queued: false,
      startedAt: Date.now() - 3000,
      result: { type: "submit", status: "Pending", passed: 0, total: 0, cases: [] },
    },
    testCases: [],
  },
};

export const AcceptedCollapsed: Story = {
  args: {
    executionState: {
      type: "submit",
      status: "complete",
      result: {
        type: "submit",
        status: "AC",
        passed: 3,
        total: 3,
        score: 100,
        cases: ["1 2", "4 5", "7 8"].map((input, index) => ({
          id: `case-${index + 1}`,
          passed: true,
          status: "AC",
          input,
          executionTime: 10 + index,
        })),
      },
    },
    testCases: [],
  },
};
