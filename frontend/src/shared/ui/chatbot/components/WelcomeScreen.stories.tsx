import { Idea, Code, Rocket } from "@carbon/icons-react";
import type { Meta, StoryObj } from "@storybook/react";
import { WelcomeScreen } from "./WelcomeScreen";

const mockSuggestedPrompts = [
  {
    icon: Idea,
    text: "解釋一下這道題目的核心概念",
    onClick: () => console.log("Clicked: Explain concept"),
  },
  {
    icon: Code,
    text: "幫我檢查代碼邏輯是否正確",
    onClick: () => console.log("Clicked: Check code"),
  },
  {
    icon: Rocket,
    text: "給我一個時間複雜度優化的方案",
    onClick: () => console.log("Clicked: Optimize"),
  },
];

const meta: Meta<typeof WelcomeScreen> = {
    title: "shared/ui/chatbot/WelcomeScreen",
    component: WelcomeScreen,
    
    args: {
      title: "我能為您做什麼？",
      subtitle: "我是 Qgent TA，可以幫助您解決程式問題、優化代碼和學習演算法。",
      suggestedPrompts: mockSuggestedPrompts,
    },
  
  parameters: {
    docs: { description: { component: 'Chatbot 歡迎屏幕 - 初次開啟時展示，帶有 Agent 頭像和建議提示。' } },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    docs: {
      description: { story: '默認歡迎屏幕 - 含頭像、標題、副標題和建議提示' },
    },
  },
  render: (args) => (
        <div
          style={{
            width: "100%",
            height: "400px",
            background: "var(--cds-layer-01)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <WelcomeScreen
            title={args.title as string}
            subtitle={args.subtitle as string}
            suggestedPrompts={args.suggestedPrompts as typeof mockSuggestedPrompts}
          />
        </div>
      ),
};

export const Minimal: Story = {
  parameters: {
    docs: {
      description: { story: '最簡版本 - 只有標題，沒有副標題和建議' },
    },
  },
  render: () => (
        <div
          style={{
            width: "100%",
            height: "300px",
            background: "var(--cds-layer-01)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <WelcomeScreen title="開始聊天吧" />
        </div>
      ),
};

export const CustomContent: Story = {
  parameters: {
    docs: {
      description: { story: '自訂內容示例 - 針對特定問題的建議' },
    },
  },
  render: () => (
        <div
          style={{
            width: "100%",
            height: "400px",
            background: "var(--cds-layer-01)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <WelcomeScreen
            title="解決 Two Sum 問題"
            subtitle="我可以幫助你理解題目、優化解決方案或檢查代碼。"
            suggestedPrompts={[
              {
                icon: Idea,
                text: "題目要求什麼？",
                onClick: () => console.log("Clicked"),
              },
              {
                icon: Rocket,
                text: "怎樣才能優化時間複雜度？",
                onClick: () => console.log("Clicked"),
              },
            ]}
          />
        </div>
      ),
};
