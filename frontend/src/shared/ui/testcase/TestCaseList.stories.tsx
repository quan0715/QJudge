import React, { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import type { TestCaseData } from "@/core/entities/testcase.entity";
import { TestCaseList } from "./TestCaseList";

const mockTestCases: TestCaseData[] = [
  { id: "1", input: "5\n1 2 3 4 5", output: "15", source: "sample" },
  { id: "2", input: "3\n10 20 30", output: "60", source: "sample" },
  { id: "3", input: "4\n1 1 1 1", output: "4", source: "custom" },
  { id: "4", input: "2\n100 200", output: "300", source: "custom" },
];

const meta: Meta<typeof TestCaseList> = {
  title: "shared/ui/testcase/TestCaseList",
  component: TestCaseList,
  parameters: {
    docs: {
      description: {
        component: "測試案例列表，支援分組顯示和新增功能。",
      },
    },
  },
  args: {
    testCases: mockTestCases,
    size: "md",
    showPreview: false,
    editable: true,
    copyable: true,
    layout: "vertical",
    grouped: true,
  },
  argTypes: {
    testCases: { control: "object", description: "測試案例資料" },
    size: {
      control: "select",
      options: ["sm", "md", "lg"],
      description: "尺寸",
    },
    showPreview: { control: "boolean", description: "是否顯示 Input 預覽" },
    editable: { control: "boolean", description: "是否可編輯" },
    copyable: { control: "boolean", description: "是否可複製" },
    layout: {
      control: "select",
      options: ["vertical", "horizontal"],
      description: "佈局模式",
    },
    grouped: { control: "boolean", description: "是否分組顯示" },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Wrapper for interactive demo
const InteractiveDemo: React.FC = () => {
  const [testCases, setTestCases] = useState<TestCaseData[]>(mockTestCases);
  const [selected, setSelected] = useState<TestCaseData | null>(null);

  const handleAdd = () => {
    const newCase: TestCaseData = {
      id: `new-${Date.now()}`,
      input: "",
      output: "",
      source: "custom",
    };
    setTestCases([...testCases, newCase]);
    setSelected(newCase);
  };

  return (
    <div style={{ maxWidth: 350 }}>
      <TestCaseList
        testCases={testCases}
        selectedId={selected?.id}
        onSelect={setSelected}
        onAdd={handleAdd}
        editable
        copyable
        grouped
        showPreview
      />
      {selected && (
        <div style={{ marginTop: "1rem", padding: "1rem", background: "var(--cds-layer-01)", borderRadius: "4px" }}>
          <strong>Selected:</strong> {selected.id}
          <pre style={{ fontSize: "0.75rem", marginTop: "0.5rem" }}>
            {selected.input || "(empty)"}
          </pre>
        </div>
      )}
    </div>
  );
};

export const Playground: Story = {
  args: {
    testCases: mockTestCases,
  },
  render: (args) => (
    <div style={{ maxWidth: 350 }}>
      <TestCaseList
        testCases={args.testCases ?? mockTestCases}
        {...args}
        onSelect={(tc) => console.log("Selected:", tc.id)}
        onAdd={() => console.log("Add clicked")}
      />
    </div>
  ),
};

export const Interactive: Story = {
  render: () => <InteractiveDemo />,
};

export const HorizontalLayout: Story = {
  render: () => (
    <div style={{ maxWidth: 500 }}>
      <TestCaseList
        testCases={mockTestCases}
        layout="horizontal"
        size="sm"
        showPreview
      />
    </div>
  ),
};
