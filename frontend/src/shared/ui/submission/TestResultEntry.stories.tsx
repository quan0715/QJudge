import type { StoryModule, Story } from "@/shared/types/story.types";
import { TestResultEntry, type TestResultEntryProps } from "./TestResultEntry";

const meta = {
  title: "shared/ui/submission/TestResultEntry",
  component: TestResultEntry,
  category: "shared" as const,
  description: "單一測試結果項目，顯示狀態圖示、編號、執行時間/記憶體",
  defaultArgs: {
    index: 1,
    status: "passed" as const,
    execTime: 125,
    memoryUsage: 8192,
    size: "md" as const,
    isHidden: false,
    isSelected: false,
    showDetails: true,
  },
  argTypes: {
    index: {
      control: "number" as const,
      label: "Index",
      description: "測試案例編號",
    },
    status: {
      control: "select" as const,
      options: ["passed", "failed", "pending"],
      label: "Status",
      description: "測試結果狀態",
    },
    execTime: {
      control: "number" as const,
      label: "Exec Time (ms)",
      description: "執行時間（毫秒）",
    },
    memoryUsage: {
      control: "number" as const,
      label: "Memory (KB)",
      description: "記憶體使用（KB）",
    },
    size: {
      control: "select" as const,
      options: ["sm", "md", "lg"],
      label: "Size",
      description: "元件尺寸",
    },
    isHidden: {
      control: "boolean" as const,
      label: "Hidden Test",
      description: "是否為隱藏測資",
    },
    isSelected: {
      control: "boolean" as const,
      label: "Selected",
      description: "是否選中",
    },
    showDetails: {
      control: "boolean" as const,
      label: "Show Details",
      description: "是否顯示執行時間/記憶體",
    },
  },
};

const stories: Story<TestResultEntryProps>[] = [
  {
    name: "Playground",
    description: "使用右側 Controls 面板調整 Props",
    render: (args) => (
      <TestResultEntry {...args} onClick={() => console.log("Clicked")} />
    ),
    code: `<TestResultEntry
  index={1}
  status="passed"
  execTime={125}
  memoryUsage={8192}
  onClick={() => {}}
/>`,
  },
  {
    name: "All States",
    description: "所有狀態與尺寸組合",
    render: () => (
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {/* Status variations */}
        <div>
          <h4 style={{ margin: "0 0 0.5rem", color: "var(--cds-text-secondary)", fontSize: "0.75rem" }}>
            Status
          </h4>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <TestResultEntry index={1} status="passed" execTime={50} memoryUsage={4096} />
            <TestResultEntry index={2} status="failed" execTime={120} memoryUsage={8192} />
            <TestResultEntry index={3} status="pending" />
          </div>
        </div>

        {/* Size variations */}
        <div>
          <h4 style={{ margin: "0 0 0.5rem", color: "var(--cds-text-secondary)", fontSize: "0.75rem" }}>
            Sizes
          </h4>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <TestResultEntry index={1} status="passed" size="sm" execTime={50} />
            <TestResultEntry index={2} status="passed" size="md" execTime={50} />
            <TestResultEntry index={3} status="passed" size="lg" execTime={50} />
          </div>
        </div>

        {/* Hidden test case */}
        <div>
          <h4 style={{ margin: "0 0 0.5rem", color: "var(--cds-text-secondary)", fontSize: "0.75rem" }}>
            Hidden Test Case
          </h4>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <TestResultEntry index={4} status="passed" isHidden />
            <TestResultEntry index={5} status="failed" isHidden />
          </div>
        </div>

        {/* Selected state */}
        <div>
          <h4 style={{ margin: "0 0 0.5rem", color: "var(--cds-text-secondary)", fontSize: "0.75rem" }}>
            Selected State
          </h4>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <TestResultEntry index={1} status="passed" isSelected onClick={() => {}} />
            <TestResultEntry index={2} status="failed" isSelected onClick={() => {}} />
          </div>
        </div>
      </div>
    ),
    code: `// Status
<TestResultEntry index={1} status="passed" />
<TestResultEntry index={2} status="failed" />
<TestResultEntry index={3} status="pending" />

// Sizes
<TestResultEntry index={1} status="passed" size="sm" />
<TestResultEntry index={2} status="passed" size="md" />
<TestResultEntry index={3} status="passed" size="lg" />

// Hidden
<TestResultEntry index={4} status="passed" isHidden />

// Selected
<TestResultEntry index={1} status="passed" isSelected onClick={() => {}} />`,
  },
];

const TestResultEntryStories: StoryModule<TestResultEntryProps> = {
  meta,
  stories,
};

export default TestResultEntryStories;
