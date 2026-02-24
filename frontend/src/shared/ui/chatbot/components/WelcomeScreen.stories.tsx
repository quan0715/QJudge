import { Idea, Code, Rocket } from "@carbon/icons-react";
import type { StoryModule } from "@/shared/types/story.types";
import type { WelcomeScreenProps } from "./WelcomeScreen";
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

const storyModule: StoryModule<WelcomeScreenProps> = {
  meta: {
    title: "shared/ui/chatbot/WelcomeScreen",
    component: WelcomeScreen,
    category: "features",
    description: "Chatbot 歡迎屏幕 - 初次開啟時展示，帶有 Agent 頭像和建議提示。",
    defaultArgs: {
      title: "我能為您做什麼？",
      subtitle: "我是 Qgent TA，可以幫助您解決程式問題、優化代碼和學習演算法。",
      suggestedPrompts: mockSuggestedPrompts,
    },
  },
  stories: [
    {
      name: "Default",
      description: "默認歡迎屏幕 - 含頭像、標題、副標題和建議提示",
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
    },
    {
      name: "Minimal",
      description: "最簡版本 - 只有標題，沒有副標題和建議",
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
    },
    {
      name: "Custom Content",
      description: "自訂內容示例 - 針對特定問題的建議",
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
    },
  ],
};

export default storyModule;
