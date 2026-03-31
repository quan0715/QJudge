import { LanguageSwitch } from "./LanguageSwitch";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta: Meta<typeof LanguageSwitch> = {
  title: "shared/config/LanguageSwitch",
  component: LanguageSwitch,
  args: { value: "zh-TW", showLabel: true, size: "sm" },
  argTypes: {
    value: { control: "select", options: ["zh-TW", "en", "ja", "ko"], description: "當前選中的語言" },
    showLabel: { control: "boolean", description: "是否顯示標簽" },
    label: { control: "text", description: "自訂標簽文字" },
    size: { control: "select", options: ["sm", "md", "lg"], description: "ContentSwitcher 尺寸" },
  },
  parameters: {
    docs: { description: { component: "語言切換組件，使用 Carbon ContentSwitcher，支援多語言切換" } },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: { value: "zh-TW", onChange: (value: string) => console.log("Language changed to:", value) },
};

export const AllStates: Story = {
  parameters: { docs: { description: { story: "不同語言選中狀態" } } },
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <LanguageSwitch value="zh-TW" onChange={() => {}} />
      <LanguageSwitch value="en" onChange={() => {}} />
      <LanguageSwitch value="zh-TW" showLabel={false} onChange={() => {}} />
    </div>
  ),
};
