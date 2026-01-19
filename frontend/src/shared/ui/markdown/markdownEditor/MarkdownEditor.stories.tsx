import { useState } from "react";
import type { StoryModule } from "@/shared/types/story.types";
import {
  MarkdownEditor,
  MarkdownField,
  InlineMarkdownEditor,
  MarkdownFieldTrigger,
  MarkdownEditorProvider,
  GlobalMarkdownEditorModal,
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

const Playground = (args: MarkdownEditorProps) => {
  const [value, setValue] = useState(args.value);
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

const TriggerWithModalStory = () => {
  const [value, setValue] = useState(SAMPLE_MD);

  return (
    <MarkdownEditorProvider>
      <div
        style={{
          maxWidth: "960px",
          margin: "0 auto",
          padding: "1rem",
          background: "var(--cds-layer-01)",
        }}
      >
        <MarkdownFieldTrigger
          id="trigger-md"
          labelText="內容"
          value={value}
          onChange={setValue}
          placeholder="點擊以開啟全螢幕編輯"
        />
      </div>
      <GlobalMarkdownEditorModal />
    </MarkdownEditorProvider>
  );
};

const storyModule: StoryModule<MarkdownEditorProps> = {
  meta: {
    title: "shared/ui/markdown/markdownEditor",
    component: MarkdownEditor,
    description:
      "Monaco 為基底的 Markdown 編輯器，內建工具列、預覽、KaTeX 與 Syntax Highlight。提供 Inline/Field/Modal 多種使用方式。",
    category: "shared",
    defaultArgs: {
      value: SAMPLE_MD,
      minHeight: "280px",
      showPreview: true,
      showToolbar: true,
      inline: false,
    },
    argTypes: {
      value: {
        control: "text",
        label: "內容",
        description: "Markdown 文字",
      },
      minHeight: {
        control: "text",
        label: "最小高度",
        description: "例如 280px",
      },
      height: {
        control: "text",
        label: "固定高度",
        description: "指定固定高度，會覆蓋 minHeight",
      },
      showPreview: {
        control: "boolean",
        label: "顯示預覽",
      },
      showToolbar: {
        control: "boolean",
        label: "顯示工具列",
      },
      inline: {
        control: "boolean",
        label: "Inline 模式",
      },
    },
  },
  stories: [
    {
      name: "Playground",
      description: "使用 Controls 調整 Monaco Markdown 編輯器各種選項",
      render: (args) => <Playground {...args} />,
      code: `<MarkdownEditor
  value={content}
  onChange={setContent}
  minHeight="280px"
  showPreview
  showToolbar
/>`,
    },
    {
      name: "Inline Editor",
      description: "直接在頁面內編輯的 Inline 版本，適合雙欄表單",
      render: () => <InlineEditorStory />,
      code: `<InlineMarkdownEditor
  id="inline-md"
  labelText="內容"
  value={content}
  onChange={setContent}
  minHeight="260px"
/>`,
    },
    {
      name: "Form Field",
      description: "Carbon 風格的表單欄位，顯示工具列與預覽",
      render: () => <MarkdownFieldStory />,
      code: `<MarkdownField
  id="md-field"
  labelText="描述"
  value={value}
  onChange={setValue}
  showPreview
/>`,
    },
    {
      name: "Trigger With Modal",
      description: "使用 Trigger + Global Modal 的全螢幕編輯體驗",
      render: () => <TriggerWithModalStory />,
      code: `<MarkdownEditorProvider>
  <MarkdownFieldTrigger
    id="trigger-md"
    labelText="內容"
    value={value}
    onChange={setValue}
  />
  <GlobalMarkdownEditorModal />
</MarkdownEditorProvider>`,
    },
  ],
};

export default storyModule;
