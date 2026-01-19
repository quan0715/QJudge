import type { StoryModule } from "@/shared/types/story.types";
import { AcrBadge, type AcrBadgeProps } from "./AcrBadge";

const storyModule: StoryModule<AcrBadgeProps> = {
  meta: {
    title: "shared/ui/tag/AcrBadge",
    component: AcrBadge,
    description: "顯示 AC Rate（通過率）的標籤組件，包含環形進度指示器",
    category: "shared",
    defaultArgs: {
      value: 65,
      size: "md",
      label: "AC Rate",
    },
    argTypes: {
      value: {
        control: "number",
        label: "通過率",
        description: "0-100 或 0-1 的數值，會自動轉換為百分比",
        defaultValue: 65,
      },
      size: {
        control: "select",
        label: "尺寸",
        description: "標籤大小",
        options: ["sm", "md"],
        defaultValue: "md",
      },
      label: {
        control: "text",
        label: "標籤文字",
        description: "顯示在數值前的文字",
        defaultValue: "AC Rate",
      },
    },
  },
  stories: [
    {
      name: "Playground",
      description: "使用右側 Controls 面板調整 Props",
      render: (args) => <AcrBadge {...args} />,
      code: `<AcrBadge value={65} size="md" label="AC Rate" />`,
    },
    {
      name: "All Ranges",
      description: "不同通過率區間：≥60% 綠色、40-59% 藍色、<40% 紅色",
      render: () => (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <AcrBadge value={85} />
            <AcrBadge value={85} size="sm" />
            <span style={{ color: "var(--cds-text-secondary)", fontSize: "0.75rem" }}>≥60%</span>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <AcrBadge value={50} />
            <AcrBadge value={50} size="sm" />
            <span style={{ color: "var(--cds-text-secondary)", fontSize: "0.75rem" }}>40-59%</span>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <AcrBadge value={25} />
            <AcrBadge value={25} size="sm" />
            <span style={{ color: "var(--cds-text-secondary)", fontSize: "0.75rem" }}>&lt;40%</span>
          </div>
        </div>
      ),
      code: `<AcrBadge value={85} />  {/* ≥60% 綠色 */}
<AcrBadge value={50} />  {/* 40-59% 藍色 */}
<AcrBadge value={25} />  {/* <40% 紅色 */}`,
    },
    {
      name: "Edge Cases",
      description: "邊界情況：0%、100%、小數輸入、undefined",
      render: () => (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <AcrBadge value={0} />
            <span style={{ color: "var(--cds-text-secondary)", fontSize: "0.75rem" }}>value=0</span>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <AcrBadge value={100} />
            <span style={{ color: "var(--cds-text-secondary)", fontSize: "0.75rem" }}>value=100</span>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <AcrBadge value={0.75} />
            <span style={{ color: "var(--cds-text-secondary)", fontSize: "0.75rem" }}>value=0.75 → 75%</span>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <AcrBadge value={undefined} />
            <span style={{ color: "var(--cds-text-secondary)", fontSize: "0.75rem" }}>undefined → 0%</span>
          </div>
        </div>
      ),
      code: `<AcrBadge value={0} />
<AcrBadge value={100} />
<AcrBadge value={0.75} />  {/* 小數自動轉百分比 */}
<AcrBadge value={undefined} />  {/* fallback to 0% */}`,
    },
  ],
};

export default storyModule;
