import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { TestResultList, type TestResultListProps } from "./TestResultList";
import type { TestResult } from "@/core/entities/submission.entity";

// Mock data
const createMockResults = (count: number): TestResult[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `tc-${i + 1}`,
    testCaseId: `${i + 1}`,
    status: i < 6 ? "AC" : i < 8 ? "WA" : i === 8 ? "TLE" : "pending",
    execTime: Math.floor(Math.random() * 200) + 10,
    memoryUsage: Math.floor(Math.random() * 16384) + 1024,
    isHidden: i >= 7,
  })) as TestResult[];

const mockResults = createMockResults(10);

const meta: Meta<typeof TestResultList> = {
  title: "shared/ui/submission/TestResultList",
  component: TestResultList,
  parameters: {
    docs: {
      description: {
        component: "測試結果列表，支援 horizontal、vertical、grid 三種佈局",
      },
    },
  },
  args: {
    results: mockResults,
    layout: "horizontal" as const,
    size: "md" as const,
    columns: 4,
    showDetails: true,
  },
  argTypes: {
    layout: {
      control: "select" as const,
      options: ["horizontal", "vertical", "grid"],
      label: "Layout",
      description: "佈局模式",
    },
    size: {
      control: "select" as const,
      options: ["sm", "md", "lg"],
      label: "Size",
      description: "元件尺寸",
    },
    columns: {
      control: "number" as const,
      label: "Grid Columns",
      description: "Grid 模式每行數量",
    },
    showDetails: {
      control: "boolean" as const,
      label: "Show Details",
      description: "是否顯示執行時間/記憶體",
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Interactive wrapper for selection
const InteractiveList = (props: TestResultListProps) => {
  const [selectedId, setSelectedId] = useState<string | number | undefined>();

  return (
    <TestResultList
      {...props}
      selectedId={selectedId}
      onSelect={(result) => setSelectedId(result.id)}
    />
  );
};

export const Playground: Story = {
  args: { results: mockResults },
  render: (args) => <InteractiveList {...(args as TestResultListProps)} />,
};

export const AllLayouts: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      {/* Horizontal */}
      <div>
        <h4 style={{ margin: "0 0 0.75rem", color: "var(--cds-text-secondary)", fontSize: "0.875rem" }}>
          Horizontal（適合側邊欄、緊湊空間）
        </h4>
        <div style={{ maxWidth: "400px", border: "1px solid var(--cds-border-subtle)", padding: "0.5rem", borderRadius: "4px" }}>
          <InteractiveList results={mockResults} layout="horizontal" size="sm" showDetails={false} />
        </div>
      </div>

      {/* Vertical */}
      <div>
        <h4 style={{ margin: "0 0 0.75rem", color: "var(--cds-text-secondary)", fontSize: "0.875rem" }}>
          Vertical（適合詳細檢視面板）
        </h4>
        <div style={{ maxWidth: "300px", border: "1px solid var(--cds-border-subtle)", padding: "0.5rem", borderRadius: "4px" }}>
          <InteractiveList results={mockResults.slice(0, 5)} layout="vertical" size="md" />
        </div>
      </div>

      {/* Grid */}
      <div>
        <h4 style={{ margin: "0 0 0.75rem", color: "var(--cds-text-secondary)", fontSize: "0.875rem" }}>
          Grid（適合全螢幕結果頁）
        </h4>
        <div style={{ border: "1px solid var(--cds-border-subtle)", padding: "0.5rem", borderRadius: "4px" }}>
          <InteractiveList results={mockResults} layout="grid" columns={5} size="md" />
        </div>
      </div>
    </div>
  ),
};
