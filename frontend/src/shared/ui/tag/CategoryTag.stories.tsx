import type { Meta, StoryObj } from "@storybook/react-vite";
import { CategoryTag } from "./CategoryTag";

const meta: Meta<typeof CategoryTag> = {
    title: "shared/ui/tag/CategoryTag",
    component: CategoryTag,
    
    args: {
      labels: ["陣列", "字串處理", "動態規劃"],
      maxVisible: 3,
      type: "cool-gray",
      size: "md",
      emptyLabel: "尚未分類",
    },
    argTypes: {
      labels: {
        control: "object",
                description: "要顯示的標籤文字陣列",
        defaultValue: ["陣列", "字串處理", "動態規劃"],
      },
      maxVisible: {
        control: "number",
                description: "超過此數量會顯示 +N",
        defaultValue: 3,
      },
      type: {
        control: "select",
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
                description: "標籤大小",
        options: ["sm", "md"],
        defaultValue: "md",
      },
      emptyLabel: {
        control: "text",
                description: "當 labels 為空時顯示的文字",
        defaultValue: "尚未分類",
      },
    },
  
  parameters: {
    docs: { description: { component: '顯示分類標籤的組件，支援多標籤顯示與溢出處理' } },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  parameters: {
    docs: {
      description: { story: '使用右側 Controls 面板調整 Props' },
      source: { code: `<CategoryTag
  labels={["陣列", "字串處理", "動態規劃"]}
  maxVisible={3}
  type="cool-gray"
/>` },
    },
  },
  render: (args) => <CategoryTag labels={args.labels ?? []} {...args} />,
};

export const AllStates: Story = {
  parameters: {
    docs: {
      description: { story: '不同狀態：溢出、單標籤、空白、小尺寸' },
      source: { code: `<CategoryTag labels={["陣列", "字串處理", "動態規劃", "二分搜尋"]} maxVisible={2} />
<CategoryTag labels={["排序"]} />
<CategoryTag labels={[]} emptyLabel="尚未分類" />
<CategoryTag labels={["陣列", "字串"]} size="sm" />` },
    },
  },
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
};

export const ColorTypes: Story = {
  parameters: {
    docs: {
      description: { story: '不同顏色類型' },
      source: { code: `<CategoryTag labels={["cool-gray"]} type="cool-gray" />
<CategoryTag labels={["cyan"]} type="cyan" />
...` },
    },
  },
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
};
