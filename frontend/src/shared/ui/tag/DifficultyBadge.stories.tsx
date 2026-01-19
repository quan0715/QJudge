import type { StoryModule } from "@/shared/types/story.types";
import { DifficultyBadge } from "./DifficultyBadge";

interface DifficultyBadgeProps {
  difficulty: "easy" | "medium" | "hard" | string;
  size?: "sm" | "md";
  className?: string;
  variant?: "tag" | "text";
}

const storyModule: StoryModule<DifficultyBadgeProps> = {
  meta: {
    title: "shared/ui/tag/DifficultyBadge",
    component: DifficultyBadge,
    description: "顯示題目難度的標籤組件，支援 Tag 和純文字兩種變體",
    category: "shared",
    defaultArgs: {
      difficulty: "medium",
      size: "md",
      variant: "tag",
    },
    argTypes: {
      difficulty: {
        control: "select",
        label: "難度",
        description: "題目難度等級",
        options: ["easy", "medium", "hard"],
        defaultValue: "medium",
      },
      size: {
        control: "select",
        label: "尺寸",
        description: "標籤大小",
        options: ["sm", "md"],
        defaultValue: "md",
      },
      variant: {
        control: "select",
        label: "變體",
        description: "顯示方式：Tag 或純文字",
        options: ["tag", "text"],
        defaultValue: "tag",
      },
    },
  },
  stories: [
    {
      name: "Playground",
      description: "使用右側 Controls 面板調整 Props",
      render: (args) => <DifficultyBadge {...args} />,
      code: `<DifficultyBadge difficulty="medium" size="md" variant="tag" />`,
    },
    {
      name: "All Difficulties",
      description: "所有難度等級：Easy 綠色、Medium 藍色、Hard 紅色",
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
      code: `<DifficultyBadge difficulty="easy" />
<DifficultyBadge difficulty="medium" />
<DifficultyBadge difficulty="hard" />
<DifficultyBadge difficulty="easy" variant="text" />`,
    },
  ],
};

export default storyModule;
