import { useWorkspace } from "../../hooks/useWorkspace";
import { ChatContainer } from "../chat-ui/ChatContainer";
import styles from "./WorkspaceShell.module.scss";

interface WorkspaceShellProps {
  children: React.ReactNode;
}

export function WorkspaceShell({ children }: WorkspaceShellProps) {
  const { isOpen, closeChat } = useWorkspace();

  return (
    <div className={styles.shell}>
      <div className={styles.content}>
        {children}
      </div>
      <aside className={`${styles.panel} ${isOpen ? styles.panelOpen : ""}`}>
        {isOpen && (
          <ChatContainer
            mode="sidebar"
            onClose={closeChat}
          />
        )}
      </aside>
    </div>
  );
}
