import type { Meta, StoryObj } from "@storybook/react";
import { QJudgeEditor } from "./QJudgeEditor";

const meta: Meta<typeof QJudgeEditor> = {
    title: "shared/ui/editor/QJudgeEditor",
    component: QJudgeEditor,
    
    args: {
      language: "javascript",
      value: `function hello() {
  console.log('Hello QJudge');
}

// Try editing this code!
hello();`,
    },
    argTypes: {
      language: {
        control: "select",
        options: ["javascript", "typescript", "python", "cpp", "java", "c"],
        description: "程式語言",
      },
      value: { control: "text", description: "初始程式碼" },
    },
  
  parameters: {
    docs: { description: { component: 'Monaco Editor 包裝器（非受控模式）。' } },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  parameters: {
    docs: {
      description: { story: '互動式程式碼編輯器。' },
      source: { code: `<QJudgeEditor
  language="javascript"
  value="console.log('Hello');"
  onChange={(code) => console.log(code)}
/>` },
    },
  },
  render: (args) => (
        <div style={{ width: "100%", height: "400px", border: "1px solid var(--cds-border-subtle)" }}>
          <QJudgeEditor
            language={args.language as string}
            value={args.value as string}
            onChange={(code) => console.log("Code changed:", code)}
          />
        </div>
      ),
};

export const AllLanguages: Story = {
  parameters: {
    docs: {
      description: { story: '展示不同程式語言的語法高亮。' },
      source: { code: `def hello():\\n    print("Hello QJudge")\\n\\nhello()` },
    },
  },
  render: () => (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {[
            { lang: "python", code: `def hello():\n    print("Hello QJudge")\n\nhello()` },
            { lang: "cpp", code: `#include <iostream>\n\nint main() {\n    std::cout << "Hello QJudge";\n    return 0;\n}` },
            { lang: "java", code: `public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello QJudge");\n    }\n}` },
          ].map(({ lang, code }) => (
            <div key={lang}>
              <div style={{ marginBottom: "0.5rem", color: "var(--cds-text-secondary)", fontSize: "0.875rem" }}>
                {lang.toUpperCase()}
              </div>
              <div style={{ width: "100%", height: "180px", border: "1px solid var(--cds-border-subtle)" }}>
                <QJudgeEditor language={lang} value={code} />
              </div>
            </div>
          ))}
        </div>
      ),
};
