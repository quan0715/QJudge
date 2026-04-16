// frontend/src/features/chatbot/components/ChatFullPage.tsx
import { ChatContainer } from "./chat-ui/ChatContainer";
import styles from "./ChatFullPage.module.scss";

export default function ChatFullPage() {
  return (
    <ChatContainer mode="full" className={styles.fullPage} />
  );
}
