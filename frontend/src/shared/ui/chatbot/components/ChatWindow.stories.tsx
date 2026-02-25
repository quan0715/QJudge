import type { StoryModule } from "@/shared/types/story.types";
import { ChatWindow, type ChatWindowProps } from "./ChatWindow";
import { WelcomeScreen } from "./WelcomeScreen";

/**
 * ChatWindow Storybook Stories
 * 展示聊天窗口的各種狀態
 *
 * 注：ChatWindow 組件依賴 useChatbot hook，
 * 在 Storybook 中需要 mock 數據和回調函數，
 * 因此展示基本組件狀態而不直接包裝 ChatWindow
 */

const storyModule: StoryModule<ChatWindowProps> = {
  meta: {
    title: "shared/ui/chatbot/ChatWindow",
    component: ChatWindow,
    category: "features",
    description:
      "聊天窗口組件 - 展示訊息列表、會話切換、歡迎屏幕等功能。" +
      "注：完整功能需要與 useChatbot hook 整合，此處展示 UI 結構。",
  },
  stories: [
    {
      name: "Welcome Screen",
      description: "初始狀態 - 歡迎屏幕（無訊息時顯示）",
      render: () => (
        <div
          style={{
            width: "420px",
            height: "600px",
            background: "var(--cds-layer-01)",
            border: "1px solid var(--cds-border-subtle-01)",
            borderRadius: "4px",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <WelcomeScreen
              title="我能為您做什麼？"
              subtitle="我是 Qgent TA，可以幫助您解決程式問題、優化代碼和學習演算法。"
              suggestedPrompts={[]}
            />
          </div>
        </div>
      ),
    },
    {
      name: "Component Hierarchy",
      description: "ChatWindow 組件結構說明",
      render: () => (
        <div
          style={{
            padding: "2rem",
            background: "var(--cds-layer-01)",
            maxWidth: "600px",
          }}
        >
          <h3 style={{ marginBottom: "1rem" }}>ChatWindow 組件結構</h3>
          <div
            style={{
              background: "var(--cds-layer-02)",
              padding: "1rem",
              borderRadius: "4px",
              fontFamily: "monospace",
              fontSize: "12px",
              color: "var(--cds-text-secondary)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
            }}
          >
            {`<ChatWindow>
  ├─ chatHeader
  │  ├─ chatTitleContainer
  │  │  ├─ chatIcon (或 agentAvatar)
  │  │  └─ sessionDropdown (Dropdown)
  │  └─ headerActions (collapse + menu buttons)
  │
  ├─ messageList (或 welcomeScreen)
  │  └─ messageBubble[] (用戶/AI 訊息)
  │     ├─ messageAvatar (AI 回覆時)
  │     ├─ bubbleContent (訊息內容/思考/工具)
  │     └─ bubbleTime (時間戳)
  │
  └─ chatInputContainer
     ├─ chatInputContext (問題 chip + bg info badge)
     ├─ chatInputBox
     │  ├─ chatInputTextarea
     │  └─ chatInputControls
     │     ├─ modelDropdownInline
     │     └─ chatInputButton (發送)`}
          </div>

          <h3 style={{ marginTop: "2rem", marginBottom: "1rem" }}>關鍵特性</h3>
          <ul style={{ color: "var(--cds-text-primary)", lineHeight: "1.8" }}>
            <li>✅ 會話切換 - 使用 Carbon Dropdown</li>
            <li>✅ 訊息流式輸出 - Delta 流更新</li>
            <li>✅ 思考過程展示 - 可折疊 Accordion</li>
            <li>✅ 工具執行記錄 - 展示工具調用詳情</li>
            <li>✅ 背景資訊提示 - Badge 顯示上下文</li>
            <li>✅ 模型選擇 - Haiku / Sonnet / Opus</li>
            <li>✅ 響應式設計 - 適配不同屏幕</li>
          </ul>
        </div>
      ),
    },
    {
      name: "Session Management Info",
      description: "會話管理說明",
      render: () => (
        <div
          style={{
            padding: "2rem",
            background: "var(--cds-layer-01)",
            maxWidth: "600px",
          }}
        >
          <h3 style={{ marginBottom: "1rem" }}>會話管理</h3>
          <div
            style={{
              background: "var(--cds-layer-02)",
              padding: "1rem",
              borderRadius: "4px",
              color: "var(--cds-text-primary)",
              lineHeight: "1.6",
            }}
          >
            <p>
              <strong>Dropdown 選擇器：</strong>
              顯示所有已保存的會話，點擊切換
            </p>
            <p style={{ marginTop: "0.5rem" }}>
              <strong>會話重用：</strong>
              清空的會話可以重新使用，不需要創建新會話
            </p>
            <p style={{ marginTop: "0.5rem" }}>
              <strong>自動儲存：</strong>
              每條訊息自動同步到後端
            </p>
            <p style={{ marginTop: "0.5rem" }}>
              <strong>新會話：</strong>
              + 按鈕創建新會話（如果沒有空會話）
            </p>
          </div>
        </div>
      ),
    },
  ],
};

export default storyModule;
