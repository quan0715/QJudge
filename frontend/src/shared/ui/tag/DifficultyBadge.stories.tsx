import type { Meta, StoryObj } from "@storybook/react";
import { DifficultyBadge } from "./DifficultyBadge";

const meta: Meta<typeof DifficultyBadge> = {
    title: "shared/ui/tag/DifficultyBadge",
    component: DifficultyBadge,
    
    args: {
      difficulty: "medium",
      size: "md",
      variant: "tag",
    },
    argTypes: {
      difficulty: {
        control: "select",
                description: "題目難度等級",
        options: ["easy", "medium", "hard"],
        defaultValue: "medium",
      },
      size: {
        control: "select",
                description: "標籤大小",
        options: ["sm", "md"],
        defaultValue: "md",
      },
      variant: {
        control: "select",
                description: "顯示方式：Tag 或純文字",
        options: ["tag", "text"],
        defaultValue: "tag",
      },
    },
  
  parameters: {
    docs: { description: { component: '顯示題目難度的標籤組件，支援 Tag 和純文字兩種變體' } },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  parameters: {
    docs: {
      description: { story: '使用右側 Controls 面板調整 Props' },
      source: { code: `<DifficultyBadge difficulty="medium" size="md" variant="tag" />` },
    },
  },
  render: (args) => <DifficultyBadge difficulty={args.difficulty ?? "medium"} {...args} />,
};

export const AllDifficulties: Story = {
  parameters: {
    docs: {
      description: { story: '所有難度等級：Easy 綠色、Medium 藍色、Hard 紅色' },
      source: { code: `<DifficultyBadge difficulty="easy" />
<DifficultyBadge difficulty="medium" />
<DifficultyBadge difficulty="hard" />
<DifficultyBadge difficulty="easy" variant="text" />` },
    },
  },
  render: () => (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <DifficultyBadge difficulty="easy" />
            <DifficultyBadge difficulty="easy" size="sm" />
            <DifficultyBadge difficulty="easy" variant="text" />
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <DifficultyBadge difficulty="medium" />
            <DifficultyBadge difficulty="medium" size="sm" />
            <DifficultyBadge difficulty="medium" variant="text" />
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <DifficultyBadge difficulty="hard" />
            <DifficultyBadge difficulty="hard" size="sm" />
            <DifficultyBadge difficulty="hard" variant="text" />
          </div>
        </div>
      ),
};
