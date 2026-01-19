import type { StoryModule } from "@/shared/types/story.types";
import { CategoryTag, type CategoryTagProps } from "./CategoryTag";

const storyModule: StoryModule<CategoryTagProps> = {
  meta: {
    title: "shared/ui/tag/CategoryTag",
    component: CategoryTag,
    description: "顯示分類標籤的組件，支援多標籤顯示與溢出處理",
    category: "shared",
    defaultArgs: {
      labels: ["陣列", "字串處理", "動態規劃"],
      maxVisible: 3,
      type: "cool-gray",
      size: "md",
      emptyLabel: "尚未分類",
    },
    argTypes: {
      labels: {
        control: "array",
        label: "標籤列表",
        description: "要顯示的標籤文字陣列",
        defaultValue: ["陣列", "字串處理", "動態規劃"],
      },
      maxVisible: {
        control: "number",
        label: "最大顯示數量",
        description: "超過此數量會顯示 +N",
        defaultValue: 3,
      },
      type: {
        control: "select",
        label: "標籤類型",
        description: "Carbon Tag 的顏色類型",
        options: [
          "red", "magenta", "purple", "blue", "cyan", 
          "teal", "green", "gray", "cool-gray", "warm-gray",
          "high-contrast", "outline",
        ],
        defaultValue: "cool-gray",
      },
      size: {
        control: "select",
        label: "尺寸",
        description: "標籤大小",
        options: ["sm", "md"],
        defaultValue: "md",
      },
      emptyLabel: {
        control: "text",
        label: "空白提示文字",
        description: "當 labels 為空時顯示的文字",
        defaultValue: "尚未分類",
      },
    },
  },
  stories: [
    {
      name: "Playground",
      description: "使用右側 Controls 面板調整 Props",
      render: (args) => <CategoryTag {...args} />,
      code: `<CategoryTag
  labels={["陣列", "字串處理", "動態規劃"]}
  maxVisible={3}
  type="cool-gray"
/>`,
    },
    {
      name: "All States",
      description: "不同狀態：溢出、單標籤、空白、小尺寸",
      render: () => (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <CategoryTag 
              labels={["陣列", "字串處理", "動態規劃", "二分搜尋", "貪心"]} 
              maxVisible={2} 
            />
            <span style={{ color: "var(--cds-text-secondary)", fontSize: "0.75rem" }}>溢出 +3</span>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <CategoryTag labels={["排序"]} />
            <span style={{ color: "var(--cds-text-secondary)", fontSize: "0.75rem" }}>單標籤</span>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <CategoryTag labels={[]} emptyLabel="尚未分類" />
            <span style={{ color: "var(--cds-text-secondary)", fontSize: "0.75rem" }}>空白</span>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <CategoryTag labels={["陣列", "字串"]} size="sm" />
            <span style={{ color: "var(--cds-text-secondary)", fontSize: "0.75rem" }}>小尺寸</span>
          </div>
        </div>
      ),
      code: `<CategoryTag labels={["陣列", "字串處理", "動態規劃", "二分搜尋"]} maxVisible={2} />
<CategoryTag labels={["排序"]} />
<CategoryTag labels={[]} emptyLabel="尚未分類" />
<CategoryTag labels={["陣列", "字串"]} size="sm" />`,
    },
    {
      name: "Color Types",
      description: "不同顏色類型",
      render: () => (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          <CategoryTag labels={["cool-gray"]} type="cool-gray" />
          <CategoryTag labels={["cyan"]} type="cyan" />
          <CategoryTag labels={["teal"]} type="teal" />
          <CategoryTag labels={["purple"]} type="purple" />
          <CategoryTag labels={["blue"]} type="blue" />
          <CategoryTag labels={["green"]} type="green" />
          <CategoryTag labels={["magenta"]} type="magenta" />
          <CategoryTag labels={["red"]} type="red" />
        </div>
      ),
      code: `<CategoryTag labels={["cool-gray"]} type="cool-gray" />
<CategoryTag labels={["cyan"]} type="cyan" />
...`,
    },
  ],
};

export default storyModule;
