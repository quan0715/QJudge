import React, { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import type { TestCaseData } from "@/core/entities/testcase.entity";
import { Stack } from "@carbon/react";
import { TestCaseDetail, type TestCaseDetailMode } from "./TestCaseDetail";
import { TestCaseList } from "./TestCaseList";

const mockSampleCase: TestCaseData = {
  id: "sample-1",
  input: "5\n1 2 3 4 5",
  output: "15",
  source: "sample",
};

const mockCustomCase: TestCaseData = {
  id: "custom-1",
  input: "3\n10 20 30",
  output: "60",
  source: "custom",
};

const mockHiddenCase: TestCaseData = {
  id: "hidden-1",
  input: "",
  output: "",
  source: "hidden",
  isHidden: true,
};

const modes: TestCaseDetailMode[] = ["readonly", "writable", "hidden"];

const meta: Meta<typeof TestCaseDetail> = {
  title: "shared/ui/testcase/TestCaseDetail",
  component: TestCaseDetail,
  parameters: {
    docs: {
      description: {
        component: "測試案例詳情，支援 readonly / writable / hidden 三種模式。",
      },
    },
  },
  args: {
    testCase: mockSampleCase,
    index: 1,
    mode: "readonly",
  },
  argTypes: {
    testCase: {
      control: "select",
      options: ["sample", "custom", "hidden", "null"],
      mapping: {
        sample: mockSampleCase,
        custom: mockCustomCase,
        hidden: mockHiddenCase,
        null: null,
      },
      description: "測試案例資料",
    },
    index: { control: "number", description: "測試案例編號" },
    mode: {
      control: "select",
      options: modes,
      description: "顯示模式",
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Interactive Demo with List + Detail
const InteractiveDemo: React.FC = () => {
  const [testCases, setTestCases] = useState<TestCaseData[]>([
    mockSampleCase,
    { ...mockSampleCase, id: "sample-2", input: "3\n10 20 30", output: "60" },
    mockCustomCase,
    { ...mockCustomCase, id: "custom-2", input: "2\n100 200", output: "300" },
  ]);
  const [selected, setSelected] = useState<TestCaseData | null>(testCases[0]);

  const isCustom = selected?.source === "custom";
  const mode: TestCaseDetailMode = isCustom ? "writable" : "readonly";

  const handleInputChange = (value: string) => {
    if (selected && isCustom) {
      const updated = { ...selected, input: value };
      setSelected(updated);
      setTestCases(testCases.map((tc) => (tc.id === selected.id ? updated : tc)));
    }
  };

  const handleOutputChange = (value: string) => {
    if (selected && isCustom) {
      const updated = { ...selected, output: value };
      setSelected(updated);
      setTestCases(testCases.map((tc) => (tc.id === selected.id ? updated : tc)));
    }
  };

  const handleAdd = () => {
    const newCase: TestCaseData = {
      id: `custom-${Date.now()}`,
      input: "",
      output: "",
      source: "custom",
    };
    setTestCases([...testCases, newCase]);
    setSelected(newCase);
  };

  const handleDelete = () => {
    if (selected && isCustom) {
      const filtered = testCases.filter((tc) => tc.id !== selected.id);
      setTestCases(filtered);
      setSelected(filtered[0] || null);
    }
  };

  const handleDuplicate = () => {
    if (selected) {
      const newCase: TestCaseData = {
        id: `custom-${Date.now()}`,
        input: selected.input,
        output: selected.output,
        source: "custom",
      };
      setTestCases([...testCases, newCase]);
      setSelected(newCase);
    }
  };

  const selectedIndex = selected
    ? testCases.findIndex((tc) => tc.id === selected.id) + 1
    : undefined;

  return (
    <Stack orientation="horizontal" gap={5} style={{ width: "100%", minHeight: 350 }}>
      <div style={{ width: 200, flexShrink: 0 }}>
        <TestCaseList
          testCases={testCases}
          selectedId={selected?.id}
          onSelect={setSelected}
          onAdd={handleAdd}
          grouped
          editable
          copyable
          size="sm"
        />
      </div>
      <div style={{ flex: 1 }}>
        <TestCaseDetail
          testCase={selected}
          index={selectedIndex}
          mode={mode}
          onInputChange={handleInputChange}
          onOutputChange={handleOutputChange}
          onDelete={isCustom ? handleDelete : undefined}
          onDuplicate={!isCustom ? handleDuplicate : undefined}
        />
      </div>
    </Stack>
  );
};

export const Playground: Story = {
  args: {
    testCase: mockSampleCase,
    index: 1,
    mode: "readonly",
  },
  render: (args) => (
    <div style={{ maxWidth: 500 }}>
      <TestCaseDetail {...args} />
    </div>
  ),
};

export const InteractiveListDetail: Story = {
  render: () => <InteractiveDemo />,
};

export const AllModes: Story = {
  render: () => (
    <Stack gap={5} style={{ width: "100%" }}>
      <div>
        <h5 style={{ marginBottom: "0.5rem" }}>Readonly (Sample)</h5>
        <TestCaseDetail testCase={mockSampleCase} index={1} mode="readonly" />
      </div>
      <div>
        <h5 style={{ marginBottom: "0.5rem" }}>Writable (Custom)</h5>
        <TestCaseDetail testCase={mockCustomCase} index={2} mode="writable" />
      </div>
      <div>
        <h5 style={{ marginBottom: "0.5rem" }}>Hidden</h5>
        <TestCaseDetail testCase={mockHiddenCase} index={3} mode="hidden" />
      </div>
    </Stack>
  ),
};
