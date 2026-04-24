// frontend/src/features/chatbot/contexts/ChatSessionContext.tsx
//
// 歷史遺留 API：原本 sessions 列表有兩份獨立 fetch（這裡一份、`useChatbot` 一份），
// Phase 6 統一成單一來源（= `useChatbot`）。此檔現在只保留 `useChatSessionContext`
// hook 作為相容層，實際值從 `ChatbotProvider` 讀取。
//
// 新程式碼建議直接用 `useChatbotContext()` / `useOptionalChatbotContext()`；
// 此 hook 保留給既有 caller 不強制改。
import { useChatbotContext } from "./ChatbotProvider";

interface ChatSessionContextValue {
  sessions: ReturnType<typeof useChatbotContext>["sessions"];
  isLoadingSessions: boolean;
  refreshSessions: ReturnType<typeof useChatbotContext>["refreshSessions"];
}

export function useChatSessionContext(): ChatSessionContextValue {
  const { sessions, isLoadingSessions, refreshSessions } = useChatbotContext();
  return { sessions, isLoadingSessions, refreshSessions };
}
