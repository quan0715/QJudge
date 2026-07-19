// frontend/src/features/chatbot/components/ChatFullPage.tsx
import { ChatContainer } from "./chat-ui/ChatContainer";
import { CopilotFullPageShell } from "@/shared/copilot";
import styles from "./ChatFullPage.module.scss";

export default function ChatFullPage() {
  return <CopilotFullPageShell history="hidden" className={styles.fullPage}><ChatContainer mode="full" /></CopilotFullPageShell>;
}
