import { IconButton } from "@carbon/react";
import { RecentlyViewed, Add, Close } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import styles from "./ChatTopBar.module.scss";

interface ChatTopBarProps {
  title?: string;
  historyOpen?: boolean;
  onToggleHistory?: () => void;
  onNewChat: () => void;
  onClose?: () => void;
}

export function ChatTopBar({
  title,
  historyOpen = false,
  onToggleHistory,
  onNewChat,
  onClose,
}: ChatTopBarProps) {
  const { t } = useTranslation("chatbot");
  const displayTitle = title || t("ui.chatbotTitle");

  return (
    <div className={styles.bar}>
      <div className={styles.left}>
        {onToggleHistory && (
          <IconButton kind="ghost" label={historyOpen ? t("ui.collapse") : t("ui.history")} onClick={onToggleHistory}>
            {historyOpen ? <Close size={20} /> : <RecentlyViewed size={20} />}
          </IconButton>
        )}
      </div>
      <span className={styles.title}>{displayTitle}</span>
      <div className={styles.right}>
        <IconButton kind="ghost" label={t("ui.newChat")} onClick={onNewChat}>
          <Add size={20} />
        </IconButton>
        {onClose && (
          <IconButton kind="ghost" label={t("ui.close")} onClick={onClose}>
            <Close size={20} />
          </IconButton>
        )}
      </div>
    </div>
  );
}
