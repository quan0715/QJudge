import { Navigate, useParams } from "react-router-dom";
import { AI_SESSION_PARAM } from "../lib/aiSessionUrl";

/**
 * Back-compat：舊的 `/chat/:sessionId` 連結統一 replace 成
 * `/chat?ai_session_id=:sessionId`，URL query 為 session 切換的唯一 source of truth。
 */
export default function ChatSessionRedirect() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const target = sessionId
    ? `/chat?${AI_SESSION_PARAM}=${encodeURIComponent(sessionId)}`
    : "/chat";
  return <Navigate to={target} replace />;
}
