import { useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useDisablePanel } from "@/features/app/contexts/useDisablePanel";
import ChatFullPage from "./ChatFullPage";

export default function ChatStandalonePage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  // /chat 主畫面本身就是 chat：不需要再開右側 chat panel 或 FAB
  useDisablePanel("right");

  const handleSessionChange = useCallback((newId: string) => {
    navigate(`/chat/${newId}`, { replace: false });
  }, [navigate]);

  const handleSessionDeleted = useCallback((fallbackId: string | null) => {
    if (fallbackId) {
      navigate(`/chat/${fallbackId}`, { replace: true });
    } else {
      navigate("/chat", { replace: true });
    }
  }, [navigate]);

  return (
    <ChatFullPage
      sessionId={sessionId ?? null}
      onSessionChange={handleSessionChange}
      onSessionDeleted={handleSessionDeleted}
    />
  );
}
