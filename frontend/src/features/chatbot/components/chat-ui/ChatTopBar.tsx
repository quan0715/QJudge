import { IconButton } from "@carbon/react";
import { RecentlyViewed, Edit, Close } from "@carbon/icons-react";
import styles from "./ChatTopBar.module.scss";

interface ChatTopBarProps {
  title?: string;
  onToggleHistory?: () => void;
  onNewChat?: () => void;
  onClose?: () => void;
}

export function ChatTopBar({ title = "QJudge AI 助教", onToggleHistory, onNewChat, onClose }: ChatTopBarProps) {
  return (
    <div className={styles.bar}>
      <div className={styles.left}>
        {onToggleHistory && (
          <IconButton kind="ghost" size="sm" label="對話紀錄" onClick={onToggleHistory}>
            <RecentlyViewed size={20} />
          </IconButton>
        )}
      </div>
      <span className={styles.title}>{title}</span>
      <div className={styles.right}>
        {onNewChat && (
          <IconButton kind="ghost" size="sm" label="新對話" onClick={onNewChat}>
            <Edit size={20} />
          </IconButton>
        )}
        {onClose && (
          <IconButton kind="ghost" size="sm" label="關閉" onClick={onClose}>
            <Close size={20} />
          </IconButton>
        )}
      </div>
    </div>
  );
}
