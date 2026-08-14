import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { TestCaseSidebarList } from "./TestCaseSidebarList";

const meta = {
  title: "shared/ui/testcase/TestCaseSidebarList",
  component: TestCaseSidebarList,
  args: {
    selectedIndex: 0,
    onSelect: fn(),
    onAdd: fn(),
    groupedCases: {
      sample: [
        { id: "sample-1", label: "Sample 1", isHidden: false },
        { id: "sample-2", label: "Sample 2", isHidden: false },
      ],
      custom: [{ id: "custom-1", label: "Custom 1" }],
    },
    labels: { addAction: "新增測資" },
  },
} satisfies Meta<typeof TestCaseSidebarList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CustomSelected: Story = {
  args: { selectedIndex: 2 },
};

export const ReadOnly: Story = {
  args: { onAdd: undefined },
};
