// frontend/src/features/chatbot/components/ChatFullPage.tsx
import { ChatContainer } from "./chat-ui/ChatContainer";
import styles from "./ChatFullPage.module.scss";

interface ChatFullPageProps {
  sessionId?: string | null;
  onSessionChange?: (newId: string) => void;
  onSessionDeleted?: (fallbackId: string | null) => void;
}

export default function ChatFullPage({ sessionId, onSessionChange, onSessionDeleted }: ChatFullPageProps) {
  return (
    <ChatContainer
      mode="full"
      className={styles.fullPage}
      externalSessionId={sessionId ?? undefined}
      onSessionChange={onSessionChange}
      onSessionDeleted={onSessionDeleted}
    />
  );
}
