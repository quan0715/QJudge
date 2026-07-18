import { useCallback } from "react";
import { useReactRouterCopilotSessionLocation } from "../adapters/reactRouterCopilotSessionLocation";

/**
 * 所有「哪個 AI session 要顯示」的跨頁 URL state 統一走這個 query param。
 * 同時服務：
 * - 全頁 /chat
 * - 側邊 SideMenu 點選 session
 * - ChatTopBar 下拉切換
 * - AI Task 流程（grading 等）auto-bind / 開新 session / 切題時
 *
 * 改 query param 不會 unmount 路由元件，所以 SSE / artifact 訂閱只會針對真正
 * 變動的 sessionId 重訂，不會出現之前 URL path + state 兩條互相扭來扭去導致
 * 的無限 switch。
 */
export const AI_SESSION_PARAM = "ai_session_id";

export function useAiSessionParam(): {
  aiSessionId: string | null;
  setAiSessionId: (id: string | null, options?: { replace?: boolean }) => void;
} {
  const location = useReactRouterCopilotSessionLocation(AI_SESSION_PARAM);
  const aiSessionId = location.get();

  const setAiSessionId = useCallback(
    (id: string | null, options?: { replace?: boolean }) => {
      location.set(id, options);
    },
    [location],
  );

  return { aiSessionId, setAiSessionId };
}
