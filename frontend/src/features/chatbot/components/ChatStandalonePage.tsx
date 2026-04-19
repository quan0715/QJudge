import { useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { GlobalHeader } from "@/features/app/components/GlobalHeader";
import ChatFullPage from "./ChatFullPage";
import styles from "./ChatStandalonePage.module.scss";

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
    <div className={styles.pageRoot}>
      <GlobalHeader />
      <main className={styles.main}>
        <ChatFullPage
          sessionId={sessionId ?? null}
          onSessionChange={handleSessionChange}
          onSessionDeleted={handleSessionDeleted}
        />
      </main>
    </div>
  );
}
