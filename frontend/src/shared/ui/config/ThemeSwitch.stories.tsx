import { ThemeSwitch, type ThemeSwitchProps, type ThemeValue } from "./ThemeSwitch";
import type { StoryModule, Story } from "@/shared/types/story.types";

const meta: StoryModule<ThemeSwitchProps>["meta"] = {
  title: "shared/config/ThemeSwitch",
  component: ThemeSwitch,
  category: "shared",
  description: "主題切換組件，使用 Carbon ContentSwitcher，支援亮色、暗色、系統偏好三種模式",
  defaultArgs: {
    value: "system",
    showLabel: true,
    size: "sm",
  },
  argTypes: {
    value: {
      control: "select",
      options: ["light", "dark", "system"],
      description: "當前選中的主題",
    },
    showLabel: {
      control: "boolean",
      description: "是否顯示標籤",
    },
    label: {
      control: "text",
      description: "自訂標籤文字",
    },
    size: {
      control: "select",
      options: ["sm", "md", "lg"],
      description: "ContentSwitcher 尺寸",
    },
  },
};

const stories: Story<ThemeSwitchProps>[] = [
  {
    name: "Playground",
    description: "使用右側 Controls 面板調整 Props",
    render: (args) => (
      <ThemeSwitch
        {...args}
        onChange={(value: ThemeValue) => console.log("Theme changed to:", value)}
      />
    ),
    code: `<ThemeSwitch value="system" onChange={handleChange} />`,
  },
  {
    name: "All States",
    description: "三種主題模式：亮色、暗色、系統偏好",
    render: () => (
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <ThemeSwitch value="light" onChange={() => {}} />
          <span style={{ color: "var(--cds-text-secondary)", fontSize: "0.75rem" }}>Light</span>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <ThemeSwitch value="dark" onChange={() => {}} />
          <span style={{ color: "var(--cds-text-secondary)", fontSize: "0.75rem" }}>Dark</span>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <ThemeSwitch value="system" onChange={() => {}} />
          <span style={{ color: "var(--cds-text-secondary)", fontSize: "0.75rem" }}>System</span>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <ThemeSwitch value="light" onChange={() => {}} showLabel={false} />
          <span style={{ color: "var(--cds-text-secondary)", fontSize: "0.75rem" }}>Without label</span>
        </div>
      </div>
    ),
    code: `<ThemeSwitch value="light" onChange={handleChange} />
<ThemeSwitch value="dark" onChange={handleChange} />
<ThemeSwitch value="system" onChange={handleChange} />
<ThemeSwitch value="light" showLabel={false} onChange={handleChange} />`,
  },
];

const ThemeSwitchStories: StoryModule<ThemeSwitchProps> = {
  meta,
  stories,
};

export default ThemeSwitchStories;
