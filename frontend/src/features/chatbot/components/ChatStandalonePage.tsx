import { useDisablePanel } from "@/features/app/contexts/useDisablePanel";
import { useRequestCopilot } from "../contexts/CopilotDemandContext";
import ChatFullPage from "./ChatFullPage";

/**
 * 全頁 /chat 路由。
 *
 * URL ↔ session 的同步工作由 `CopilotSessionLocation` 統一管理，且統一走 URL query
 * `?ai_session_id=<id>` 作為單一 source of truth。本元件只負責：
 * - 關閉 side panel（這條路由不顯示右側面板）
 * - 宣告需要 Copilot runtime（右側面板關閉時仍需啟用）
 * - 渲染 ChatFullPage
 */
export default function ChatStandalonePage() {
  useDisablePanel("right");
  useRequestCopilot();
  return <ChatFullPage />;
}
