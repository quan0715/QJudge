import { LanguageSwitch, type LanguageSwitchProps } from "./LanguageSwitch";
import type { StoryModule, Story } from "@/shared/types/story.types";

const meta: StoryModule<LanguageSwitchProps>["meta"] = {
  title: "shared/config/LanguageSwitch",
  component: LanguageSwitch,
  category: "shared",
  description: "語言切換組件，使用 Carbon ContentSwitcher，支援多語言切換",
  defaultArgs: {
    value: "zh-TW",
    showLabel: true,
    size: "sm",
  },
  argTypes: {
    value: {
      control: "select",
      options: ["zh-TW", "en", "ja", "ko"],
      description: "當前選中的語言",
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

const stories: Story<LanguageSwitchProps>[] = [
  {
    name: "Playground",
    description: "使用右側 Controls 面板調整 Props",
    render: (args) => (
      <LanguageSwitch
        {...args}
        onChange={(value: string) => console.log("Language changed to:", value)}
      />
    ),
    code: `<LanguageSwitch value="zh-TW" onChange={handleChange} />`,
  },
  {
    name: "All States",
    description: "不同語言選中狀態",
    render: () => (
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <LanguageSwitch value="zh-TW" onChange={() => {}} />
          <span style={{ color: "var(--cds-text-secondary)", fontSize: "0.75rem" }}>繁體中文</span>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <LanguageSwitch value="en" onChange={() => {}} />
          <span style={{ color: "var(--cds-text-secondary)", fontSize: "0.75rem" }}>English</span>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <LanguageSwitch value="zh-TW" onChange={() => {}} showLabel={false} />
          <span style={{ color: "var(--cds-text-secondary)", fontSize: "0.75rem" }}>Without label</span>
        </div>
      </div>
    ),
    code: `<LanguageSwitch value="zh-TW" onChange={handleChange} />
<LanguageSwitch value="en" onChange={handleChange} />
<LanguageSwitch value="zh-TW" showLabel={false} onChange={handleChange} />`,
  },
];

const LanguageSwitchStories: StoryModule<LanguageSwitchProps> = {
  meta,
  stories,
};

export default LanguageSwitchStories;
