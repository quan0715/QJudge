import { ThemeSwitch, type ThemeValue } from "./ThemeSwitch";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta: Meta<typeof ThemeSwitch> = {
  title: "shared/config/ThemeSwitch",
  component: ThemeSwitch,
  args: { value: "system", showLabel: true, size: "sm" },
  argTypes: {
    value: { control: "select", options: ["light", "dark", "system"], description: "當前選中的主題" },
    showLabel: { control: "boolean", description: "是否顯示標簽" },
    label: { control: "text", description: "自訂標簽文字" },
    size: { control: "select", options: ["sm", "md", "lg"], description: "ContentSwitcher 尺寸" },
  },
  parameters: {
    docs: { description: { component: "主題切換組件，使用 Carbon ContentSwitcher，支援亮色、暗色、系統偶好三種模式" } },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: { value: "system" as ThemeValue, onChange: (value: ThemeValue) => console.log("Theme:", value) },
};

export const AllStates: Story = {
  parameters: { docs: { description: { story: "三種主題模式：亮色、暗色、系統偶好" } } },
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <ThemeSwitch value="light" onChange={() => {}} />
      <ThemeSwitch value="dark" onChange={() => {}} />
      <ThemeSwitch value="system" onChange={() => {}} />
    </div>
  ),
};
