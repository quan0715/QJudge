import { useState } from "react";
import type { StoryModule } from "@/shared/types/story.types";
import type { ChatbotWidgetProps } from "./ChatbotWidget";
import { ChatbotWidget } from "./ChatbotWidget";

/**
 * Chatbot Widget Storybook Stories
 * 展示 Chatbot Widget 的各種狀態和配置
 */

const storyModule: StoryModule<ChatbotWidgetProps> = {
  meta: {
    title: "features/chatbot/ChatbotWidget",
    component: ChatbotWidget,
    category: "features",
    description: "AI Chatbot 聊天面板 - 支援會話管理、流式輸出、工具執行等功能。",
    defaultArgs: {
      defaultExpanded: false,
      problemContext: null,
      backgroundInfo: null,
    },
    argTypes: {
      defaultExpanded: {
        control: "boolean",
        description: "初始是否展開面板",
      },
    },
  },
  stories: [
    {
      name: "Default (Collapsed)",
      description: "默認狀態 - 浮動按鈕（未展開）",
      render: (args) => (
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "600px",
            background: "var(--cds-layer-01)",
            border: "1px solid var(--cds-border-subtle-01)",
          }}
        >
          <ChatbotWidget
            defaultExpanded={args.defaultExpanded as boolean}
            problemContext={args.problemContext}
            backgroundInfo={args.backgroundInfo}
          />
        </div>
      ),
    },
    {
      name: "Expanded Panel",
      description: "展開狀態 - 聊天面板",
      render: (args) => (
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "600px",
            background: "var(--cds-layer-01)",
            display: "flex",
          }}
        >
          <ChatbotWidget
            defaultExpanded={true}
            problemContext={args.problemContext}
            backgroundInfo={args.backgroundInfo}
          />
        </div>
      ),
    },
    {
      name: "With Problem Context",
      description: "帶有題目上下文 - 在輸入框上方顯示題目 chip",
      render: () => (
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "600px",
            background: "var(--cds-layer-01)",
            display: "flex",
          }}
        >
          <ChatbotWidget
            defaultExpanded={true}
            problemContext={{
              id: 1,
              title: "Two Sum",
            }}
          />
        </div>
      ),
    },
    {
      name: "With Background Info",
      description: "帶背景資訊 - 第一條訊息會包含上下文",
      render: () => (
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "600px",
            background: "var(--cds-layer-01)",
            display: "flex",
          }}
        >
          <ChatbotWidget
            defaultExpanded={true}
            backgroundInfo={{
              context: "user_is_solving_problem",
              problemId: "two-sum",
              problemTitle: "Two Sum",
              difficulty: "Easy",
            }}
          />
        </div>
      ),
    },
    {
      name: "Full Configuration",
      description: "完整配置 - 帶題目和背景資訊",
      render: () => (
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "600px",
            background: "var(--cds-layer-01)",
            display: "flex",
          }}
        >
          <ChatbotWidget
            defaultExpanded={true}
            problemContext={{
              id: 1,
              title: "Two Sum",
            }}
            backgroundInfo={{
              context: "user_is_solving_problem",
              problemId: "two-sum",
              problemTitle: "Two Sum",
              difficulty: "Easy",
              description:
                "給定一個整數數組 nums 和一個整數 target，請你在該數組中找出和為目標值 target 的那兩個整數。",
            }}
          />
        </div>
      ),
    },
    {
      name: "Floating Button States",
      description: "浮動按鈕的各種狀態展示",
      render: () => {
        const FloatingButtonDemo = () => {
          const [expanded, setExpanded] = useState(false);

          return (
            <div
              style={{
                position: "relative",
                width: "100%",
                height: "400px",
                background: "var(--cds-layer-01)",
                border: "1px solid var(--cds-border-subtle-01)",
              }}
            >
              <div
                style={{
                  padding: "2rem",
                  fontSize: "14px",
                  color: "var(--cds-text-secondary)",
                }}
              >
                <p>浮動按鈕位置：右下角</p>
                <p>點擊按鈕可展開/收合聊天面板</p>
                <p>按鈕使用 Agent Avatar 頭像，具有 hover 和 active 互動效果</p>
              </div>
              <ChatbotWidget
                defaultExpanded={expanded}
                problemContext={{ id: 1, title: "Two Sum" }}
              />
            </div>
          );
        };

        return <FloatingButtonDemo />;
      },
    },
  ],
};

export default storyModule;
