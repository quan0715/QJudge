import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useDisablePanel } from "@/features/app/contexts/useDisablePanel";
import { useChatbotContext } from "../contexts/ChatbotProvider";
import ChatFullPage from "./ChatFullPage";

/**
 * 全頁 /chat 路由 — 單純做 URL <-> currentSessionId 的雙向同步。
 * Session 生命週期由全域 ChatbotProvider 負責；此元件只負責導航。
 */
export default function ChatStandalonePage() {
  const { sessionId: urlSessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  useDisablePanel("right");

  const { currentSessionId, isInitializing, switchSession } = useChatbotContext();

  // URL → chatbot：使用者直接貼連結或按瀏覽器返回時把 provider 切到該 session。
  useEffect(() => {
    if (!urlSessionId || isInitializing) return;
    if (currentSessionId === urlSessionId) return;
    void switchSession(urlSessionId);
  }, [urlSessionId, isInitializing, currentSessionId, switchSession]);

  // chatbot → URL：provider 內部切/新建/刪除 session 時反映到網址。
  useEffect(() => {
    if (isInitializing) return;
    if (!currentSessionId) {
      if (urlSessionId) navigate("/chat", { replace: true });
      return;
    }
    if (currentSessionId === urlSessionId) return;
    navigate(`/chat/${currentSessionId}`, { replace: !urlSessionId });
  }, [currentSessionId, isInitializing, urlSessionId, navigate]);

  return <ChatFullPage />;
}
