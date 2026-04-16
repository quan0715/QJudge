import { IconButton } from "@carbon/react";
import { RecentlyViewed, Edit } from "@carbon/icons-react";
import styles from "./ChatTopBar.module.scss";

interface ChatTopBarProps {
  title?: string;
  onToggleHistory: () => void;
  onNewChat: () => void;
}

export function ChatTopBar({ title = "QJudge AI 助教", onToggleHistory, onNewChat }: ChatTopBarProps) {
  return (
    <div className={styles.bar}>
      <IconButton kind="ghost" size="sm" label="對話紀錄" onClick={onToggleHistory}>
        <RecentlyViewed size={20} />
      </IconButton>
      <span className={styles.title}>{title}</span>
      <IconButton kind="ghost" size="sm" label="新對話" onClick={onNewChat}>
        <Edit size={20} />
      </IconButton>
    </div>
  );
}
