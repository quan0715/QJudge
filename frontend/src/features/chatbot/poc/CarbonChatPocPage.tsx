/**
 * Carbon AI Chat PoC Page
 *
 * 用途：驗證 @carbon/ai-chat 與 QJudge ai-service 的整合可行性
 * 路由：/dev/carbon-chat（無需登入）
 *
 * 測試場景（在聊天框輸入關鍵字）：
 *   - 任意文字          → Markdown 串流文字
 *   - 含「搜尋」「工具」 → chain_of_thought 工具呼叫展示
 *   - 含「新增」「確認」 → OptionItem 確認按鈕流程
 *   - 含「錯誤」        → InlineErrorItem 錯誤顯示
 *   - ⋮ → View chats   → 列出 mock sessions，點擊可載入歷史對話
 */
import { useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  ChatContainer,
  BusEventType,
  WriteableElementName,
  type ChatInstance,
  type HistoryItem,
} from "@carbon/ai-chat";
import {
  mockCustomSendMessage,
  MOCK_HISTORY_ITEMS,
  MOCK_HISTORY_ITEMS_S2,
} from "./mockSendMessage";

// ── Mock session registry ──────────────────────────────────────────────────
interface MockSession {
  id: string;
  title: string;
  subtitle: string;
  items: HistoryItem[];
}

const MOCK_SESSIONS: MockSession[] = [
  {
    id: "s1",
    title: "動態規劃討論",
    subtitle: "什麼是最長遞增子序列？",
    items: MOCK_HISTORY_ITEMS,
  },
  {
    id: "s2",
    title: "新增二元樹題目",
    subtitle: "確認要新增「二元樹層序遍歷」...",
    items: MOCK_HISTORY_ITEMS_S2,
  },
];

// ── HistoryPanelContent: renders the "View chats" session list ────────────
interface HistoryPanelContentProps {
  instanceRef: React.MutableRefObject<ChatInstance | null>;
}

function HistoryPanelContent({ instanceRef }: HistoryPanelContentProps) {
  const loadSession = useCallback(
    (session: MockSession) => {
      const instance = instanceRef.current;
      if (!instance) return;
      // Restart conversation then replay the session's messages
      instance.messaging.restartConversation();
      // Small delay to let Carbon reset state before injecting history
      setTimeout(() => {
        instance.messaging.insertHistory(session.items);
      }, 200);
    },
    [instanceRef],
  );

  return (
    <div
      style={{
        padding: "1rem",
        fontFamily: "IBM Plex Sans, sans-serif",
        height: "100%",
        overflowY: "auto",
      }}
    >
      <p
        style={{
          fontSize: "0.75rem",
          color: "var(--cds-text-helper, #6f6f6f)",
          marginBottom: "0.75rem",
        }}
      >
        Mock sessions — click to load
      </p>
      {MOCK_SESSIONS.map((s) => (
        <button
          key={s.id}
          onClick={() => loadSession(s)}
          style={{
            display: "block",
            width: "100%",
            textAlign: "left",
            background: "none",
            border: "none",
            borderBottom: "1px solid var(--cds-border-subtle-01, #e0e0e0)",
            padding: "0.75rem 0",
            cursor: "pointer",
          }}
        >
          <div
            style={{
              fontWeight: 600,
              fontSize: "0.875rem",
              color: "var(--cds-text-primary, #161616)",
              marginBottom: "0.25rem",
            }}
          >
            {s.title}
          </div>
          <div
            style={{
              fontSize: "0.75rem",
              color: "var(--cds-text-secondary, #525252)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {s.subtitle}
          </div>
        </button>
      ))}
    </div>
  );
}

// ── Stable configs (outside component to avoid identity churn) ───────────
const headerConfig = { title: "QJudge AI 助教" };
const launcherConfig = { isOn: true };
const historyConfig = { isOn: true };
const homescreenConfig = {
  isOn: true,
  starterButtons: {
    buttons: [
      { label: "解釋動態規劃" },
      { label: "搜尋相關題目" },
      { label: "新增題目（Approval 流程）" },
      { label: "模擬錯誤" },
    ],
  },
};

export default function CarbonChatPocPage() {
  const instanceRef = useRef<ChatInstance | null>(null);

  const messagingConfig = useRef({
    customSendMessage: mockCustomSendMessage,
    showStopButtonImmediately: true,
    messageTimeoutSecs: 30,
    customLoadHistory: async (_instance: ChatInstance): Promise<HistoryItem[]> => {
      await new Promise((r) => setTimeout(r, 300));
      return MOCK_HISTORY_ITEMS;
    },
  }).current;

  const renderWriteableElements = useRef({
    [WriteableElementName.HISTORY_PANEL_ELEMENT]: (
      <HistoryPanelContent instanceRef={instanceRef} />
    ),
  }).current;

  const handleBeforeRender = useCallback((instance: ChatInstance) => {
    instanceRef.current = instance;
    instance.on({
      type: BusEventType.SEND,
      handler: (event) => console.debug("[PoC] send", event),
    });
    instance.on({
      type: BusEventType.RECEIVE,
      handler: (event) => console.debug("[PoC] receive", event),
    });
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--cds-background, #f4f4f4)",
        padding: "2rem",
        fontFamily: "IBM Plex Sans, sans-serif",
      }}
    >
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <h1
          style={{
            fontSize: "2rem",
            fontWeight: 600,
            marginBottom: "0.5rem",
            color: "var(--cds-text-primary, #161616)",
          }}
        >
          Carbon AI Chat — PoC
        </h1>
        <p
          style={{
            fontSize: "0.875rem",
            color: "var(--cds-text-secondary, #525252)",
            marginBottom: "2rem",
          }}
        >
          驗證 <code>@carbon/ai-chat</code> 與 QJudge ai-service 整合可行性（純前端 mock，無需後端）
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "1rem",
          }}
        >
          {[
            {
              label: "📝 Markdown 串流",
              trigger: '輸入任意文字（例：「解釋動態規劃」）',
              validates: "TextItem streaming + addMessageChunk",
            },
            {
              label: "🔧 Tool call / Chain-of-thought",
              trigger: '含「搜尋」或「工具」',
              validates: "chain_of_thought in message_options",
            },
            {
              label: "✅ Approval 確認流程",
              trigger: '含「新增」或「確認」',
              validates: "OptionItem with button preference",
            },
            {
              label: "❌ 錯誤顯示",
              trigger: '含「錯誤」',
              validates: "InlineErrorItem",
            },
            {
              label: "🕐 View chats",
              trigger: '⋮ 選單 → View chats → 點擊 session',
              validates: "WriteableElementName.HISTORY_PANEL_ELEMENT + insertHistory",
            },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                background: "var(--cds-layer, #ffffff)",
                border: "1px solid var(--cds-border-subtle-01, #e0e0e0)",
                borderRadius: "0.5rem",
                padding: "1rem 1.25rem",
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>
                {s.label}
              </div>
              <div
                style={{
                  fontSize: "0.8125rem",
                  color: "var(--cds-text-secondary, #525252)",
                  marginBottom: "0.5rem",
                }}
              >
                {s.trigger}
              </div>
              <code
                style={{
                  fontSize: "0.75rem",
                  background: "var(--cds-layer-02, #f4f4f4)",
                  padding: "0.125rem 0.375rem",
                  borderRadius: "0.25rem",
                  color: "var(--cds-text-secondary, #525252)",
                }}
              >
                {s.validates}
              </code>
            </div>
          ))}
        </div>

        <p
          style={{
            marginTop: "1.5rem",
            fontSize: "0.8125rem",
            color: "var(--cds-text-helper, #6f6f6f)",
          }}
        >
          💡 點擊右下角的 AI 按鈕開啟聊天視窗。
        </p>
      </div>

      {createPortal(
        <ChatContainer
          debug
          aiEnabled
          openChatByDefault
          header={headerConfig}
          launcher={launcherConfig}
          messaging={messagingConfig}
          history={historyConfig}
          homescreen={homescreenConfig}
          assistantName="QJudge AI"
          renderWriteableElements={renderWriteableElements}
          onBeforeRender={handleBeforeRender}
        />,
        document.body,
      )}
    </div>
  );
}

