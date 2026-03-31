import type { Meta, StoryObj } from "@storybook/react";
import { AcrBadge } from "./AcrBadge";

const meta: Meta<typeof AcrBadge> = {
    title: "shared/ui/tag/AcrBadge",
    component: AcrBadge,
    
    args: {
      value: 65,
      size: "md",
      label: "AC Rate",
    },
    argTypes: {
      value: {
        control: "number",
                description: "0-100 或 0-1 的數值，會自動轉換為百分比",
        defaultValue: 65,
      },
      size: {
        control: "select",
                description: "標籤大小",
        options: ["sm", "md"],
        defaultValue: "md",
      },
      label: {
        control: "text",
                description: "顯示在數值前的文字",
        defaultValue: "AC Rate",
      },
    },
  
  parameters: {
    docs: { description: { component: '顯示 AC Rate（通過率）的標籤組件，包含環形進度指示器' } },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  parameters: {
    docs: {
      description: { story: '使用右側 Controls 面板調整 Props' },
      source: { code: `<AcrBadge value={65} size="md" label="AC Rate" />` },
    },
  },
  render: (args) => <AcrBadge {...args} />,
};

export const AllRanges: Story = {
  parameters: {
    docs: {
      description: { story: '不同通過率區間：≥60% 綠色、40-59% 藍色、<40% 紅色' },
      source: { code: `<AcrBadge value={85} />  {/* ≥60% 綠色 */}
<AcrBadge value={50} />  {/* 40-59% 藍色 */}
<AcrBadge value={25} />  {/* <40% 紅色 */}` },
    },
  },
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
};

export const EdgeCases: Story = {
  parameters: {
    docs: {
      description: { story: '邊界情況：0%、100%、小數輸入、undefined' },
      source: { code: `<AcrBadge value={0} />
<AcrBadge value={100} />
<AcrBadge value={0.75} />  {/* 小數自動轉百分比 */}
<AcrBadge value={undefined} />  {/* fallback to 0% */}` },
    },
  },
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
};
