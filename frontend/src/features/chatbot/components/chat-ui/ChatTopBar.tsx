import { IconButton } from "@carbon/react";
import { RecentlyViewed, Add, Close } from "@carbon/icons-react";
import styles from "./ChatTopBar.module.scss";

interface ChatTopBarProps {
  title?: string;
  historyOpen?: boolean;
  onToggleHistory?: () => void;
  onNewChat: () => void;
  onClose?: () => void;
}

export function ChatTopBar({
  title = "QJudge AI 助教",
  historyOpen = false,
  onToggleHistory,
  onNewChat,
  onClose,
}: ChatTopBarProps) {
  return (
    <div className={styles.bar}>
      <div className={styles.left}>
        {onToggleHistory && (
          <IconButton kind="ghost" label={historyOpen ? "收合面板" : "對話紀錄"} onClick={onToggleHistory}>
            {historyOpen ? <Close size={20} /> : <RecentlyViewed size={20} />}
          </IconButton>
        )}
      </div>
      <span className={styles.title}>{title}</span>
      <div className={styles.right}>
        <IconButton kind="ghost" label="新對話" onClick={onNewChat}>
          <Add size={20} />
        </IconButton>
        {onClose && (
          <IconButton kind="ghost" label="關閉" onClick={onClose}>
            <Close size={20} />
          </IconButton>
        )}
      </div>
    </div>
  );
}
