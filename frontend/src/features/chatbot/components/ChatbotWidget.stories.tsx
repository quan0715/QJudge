import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChatbotWidget } from "./ChatbotWidget";

/**
 * Chatbot Widget Storybook Stories
 * 展示 Chatbot Widget 的各種狀態和配置
 */

const meta: Meta<typeof ChatbotWidget> = {
    title: "features/chatbot/ChatbotWidget",
    component: ChatbotWidget,
    
    args: {
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
  
  parameters: {
    docs: { description: { component: 'AI Chatbot 聊天面板 - 支援會話管理、流式輸出、工具執行等功能。' } },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const DefaultCollapsed: Story = {
  parameters: {
    docs: {
      description: { story: '默認狀態 - 浮動按鈕（未展開）' },
    },
  },
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
};

export const ExpandedPanel: Story = {
  parameters: {
    docs: {
      description: { story: '展開狀態 - 聊天面板' },
    },
  },
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
};

export const WithProblemContext: Story = {
  parameters: {
    docs: {
      description: { story: '帶有題目上下文 - 在輸入框上方顯示題目 chip' },
    },
  },
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
};

export const WithBackgroundInfo: Story = {
  parameters: {
    docs: {
      description: { story: '帶背景資訊 - 第一條訊息會包含上下文' },
    },
  },
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
};

export const FullConfiguration: Story = {
  parameters: {
    docs: {
      description: { story: '完整配置 - 帶題目和背景資訊' },
    },
  },
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
};

export const FloatingButtonStates: Story = {
  parameters: {
    docs: {
      description: { story: '浮動按鈕的各種狀態展示' },
    },
  },
  render: () => {
        const FloatingButtonDemo = () => {
          const [expanded, _setExpanded] = useState(false);

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
};
