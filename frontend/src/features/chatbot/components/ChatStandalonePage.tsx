import { useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ChatFullPage from "./ChatFullPage";

export default function ChatStandalonePage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

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
