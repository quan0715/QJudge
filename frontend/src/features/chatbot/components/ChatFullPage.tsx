// frontend/src/features/chatbot/components/ChatFullPage.tsx
import { QJudgeChatPanel } from "./chat-ui/QJudgeChatPanel";
import styles from "./ChatFullPage.module.scss";

export default function ChatFullPage() {
  return <QJudgeChatPanel mode="full" className={styles.fullPage} />;
}
