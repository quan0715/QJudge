import type { Meta, StoryObj } from "@storybook/react-vite";
import { IconButton, Theme } from "@carbon/react";
import { ThinkingPen } from "./ThinkingPen";

const meta = {
  title: "Shared/ThinkingPen",
  component: ThinkingPen,
  parameters: { layout: "centered" },
  args: { size: 40 },
  decorators: [(Story) => <Theme theme="g100"><Story /></Theme>],
} satisfies Meta<typeof ThinkingPen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Chat: Story = {};

export const Navbar: Story = {
  args: { size: 32 },
  render: (args) => (
    <IconButton kind="ghost" size="lg" align="bottom" label="AI 助教 · 處理中" aria-busy="true">
      <ThinkingPen {...args} />
    </IconButton>
  ),
};

export const LightNavbar: Story = {
  ...Navbar,
  decorators: [(Story) => <Theme theme="white"><Story /></Theme>],
};
