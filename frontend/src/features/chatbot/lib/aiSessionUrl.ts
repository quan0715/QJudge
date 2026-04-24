import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

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
  const [searchParams, setSearchParams] = useSearchParams();
  const aiSessionId = searchParams.get(AI_SESSION_PARAM);

  const setAiSessionId = useCallback(
    (id: string | null, options?: { replace?: boolean }) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id) {
            next.set(AI_SESSION_PARAM, id);
          } else {
            next.delete(AI_SESSION_PARAM);
          }
          return next;
        },
        { replace: options?.replace ?? true },
      );
    },
    [setSearchParams],
  );

  return { aiSessionId, setAiSessionId };
}
