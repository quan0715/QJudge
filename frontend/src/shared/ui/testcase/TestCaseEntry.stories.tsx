import type { Meta, StoryObj } from "@storybook/react";
import type { TestCaseSource } from "@/core/entities/testcase.entity";
import { TestCaseEntry } from "./TestCaseEntry";

const sources: TestCaseSource[] = ["sample", "custom", "hidden"];

const meta: Meta<typeof TestCaseEntry> = {
  title: "shared/ui/testcase/TestCaseEntry",
  component: TestCaseEntry,
  parameters: {
    docs: {
      description: {
        component: "單一測試案例的顯示元件，用於「自訂測資」或「查看範例測資」。",
      },
    },
  },
  args: {
    index: 1,
    source: "sample",
    isHidden: false,
    size: "md",
    isSelected: false,
    editable: false,
    copyable: false,
  },
  argTypes: {
    index: { control: "number", description: "測試案例編號" },
    source: {
      control: "select",
      options: sources,
      description: "來源類型",
    },
    label: { control: "text", description: "自訂標籤" },
    isHidden: { control: "boolean", description: "是否為隱藏測資" },
    size: {
      control: "select",
      options: ["sm", "md", "lg"],
      description: "尺寸",
    },
    isSelected: { control: "boolean", description: "是否選中" },
    editable: { control: "boolean", description: "是否可編輯" },
    copyable: { control: "boolean", description: "是否可複製" },
    inputPreview: { control: "text", description: "Input 預覽" },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: {
    index: 1,
    source: "sample",
  },
  render: (args) => (
    <div style={{ maxWidth: 300 }}>
      <TestCaseEntry
        index={args.index ?? 1}
        source={args.source ?? "sample"}
        {...args}
        onClick={() => console.log(`Clicked test case ${args.index}`)}
      />
    </div>
  ),
};

export const AllStates: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: 300 }}>
      {/* Sample Cases */}
      <TestCaseEntry index={1} source="sample" />
      <TestCaseEntry index={2} source="sample" isSelected />
      <TestCaseEntry index={3} source="sample" copyable />

      {/* Custom Cases */}
      <TestCaseEntry index={4} source="custom" />
      <TestCaseEntry index={5} source="custom" isSelected editable />

      {/* Hidden Case */}
      <TestCaseEntry index={6} source="hidden" isHidden />

      {/* With Preview */}
      <TestCaseEntry
        index={7}
        source="sample"
        inputPreview="5\n1 2 3 4 5"
      />
    </div>
  ),
};
