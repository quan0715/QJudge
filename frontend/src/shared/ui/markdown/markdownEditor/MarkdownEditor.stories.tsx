import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  MarkdownEditor,
  MarkdownField,
  InlineMarkdownEditor,
} from "./index";
import type { MarkdownEditorProps } from "./MarkdownEditor";

const SAMPLE_MD = `# QJudge Markdown

支援 **粗體**、_斜體_、\`inline code\`

- 列表項目 A
- 列表項目 B

\`\`\`cpp
int main() { return 0; }
\`\`\`
`;

const PlaygroundComponent = (args: Partial<MarkdownEditorProps>) => {
  const [value, setValue] = useState(args.value ?? "");
  return <MarkdownEditor {...args} value={value} onChange={setValue} />;
};

const InlineEditorStory = () => {
  const [value, setValue] = useState(SAMPLE_MD);
  return (
    <div style={{ maxWidth: "960px" }}>
      <InlineMarkdownEditor
        id="inline-md"
        labelText="Inline Markdown"
        value={value}
        onChange={setValue}
        minHeight="260px"
      />
    </div>
  );
};

const MarkdownFieldStory = () => {
  const [value, setValue] = useState("請輸入內容...");
  return (
    <div style={{ maxWidth: "960px" }}>
      <MarkdownField
        id="md-field"
        labelText="描述"
        value={value}
        onChange={setValue}
        minHeight="200px"
        showPreview
        helperText="遵循 Markdown 語法，支援數學公式與程式碼區塊"
      />
    </div>
  );
};

const meta: Meta<typeof MarkdownEditor> = {
    title: "shared/ui/markdown/markdownEditor",
    component: MarkdownEditor,
    
    args: {
      value: SAMPLE_MD,
      minHeight: "280px",
      showPreview: true,
      showToolbar: true,
      inline: false,
    },
    argTypes: {
      value: {
        control: "text",
                description: "Markdown 文字",
      },
      minHeight: {
        control: "text",
                description: "例如 280px",
      },
      height: {
        control: "text",
                description: "指定固定高度，會覆蓋 minHeight",
      },
      showPreview: {
        control: "boolean",
        description: "顯示預覽",
      },
      showToolbar: {
        control: "boolean",
        description: "顯示工具列",
      },
      inline: {
        control: "boolean",
        description: "Inline 模式",
      },
    },
  
  parameters: {
    docs: { description: { component: 'Monaco 為基底的 Markdown 編輯器，內建工具列、預覽、KaTeX 與 Syntax Highlight。提供 Inline/Field/Modal 多種使用方式。' } },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  parameters: {
    docs: {
      description: { story: '使用 Controls 調整 Monaco Markdown 編輯器各種選項' },
      source: { code: `<MarkdownEditor
  value={content}
  onChange={setContent}
  minHeight="280px"
  showPreview
  showToolbar
/>` },
    },
  },
  render: (args) => <PlaygroundComponent {...args} />,
};

export const InlineEditor: Story = {
  parameters: {
    docs: {
      description: { story: '直接在頁面內編輯的 Inline 版本，適合雙欄表單' },
      source: { code: `<InlineMarkdownEditor
  id="inline-md"
  labelText="內容"
  value={content}
  onChange={setContent}
  minHeight="260px"
/>` },
    },
  },
  render: () => <InlineEditorStory />,
};

export const FormField: Story = {
  parameters: {
    docs: {
      description: { story: 'Carbon 風格的表單欄位，顯示工具列與預覽' },
      source: { code: `<MarkdownField
  id="md-field"
  labelText="描述"
  value={value}
  onChange={setValue}
  showPreview
/>` },
    },
  },
  render: () => <MarkdownFieldStory />,
};
