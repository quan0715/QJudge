import type { ReactNode } from "react";
import { Button, ClickableTile } from "@carbon/react";
import { TrashCan } from "@carbon/icons-react";
import type { Announcement } from "@/infrastructure/api/repositories/announcement.repository";
import styles from "./AnnouncementCard.module.scss";

export interface AnnouncementCardProps {
  /** 公告資料 */
  announcement: Announcement;
  /** 點擊事件 */
  onClick?: () => void;
  /** 截斷內容長度，預設 200，設為 0 則不截斷 */
  maxContentLength?: number;
  /** 日期格式化函式 */
  formatDate?: (dateStr: string) => string;
  /** 刪除事件 */
  onDelete?: (id: number | string) => void;
  /** 是否可刪除 */
  canDelete?: boolean;
  /** 自訂操作按鈕 */
  actions?: ReactNode;
  /** 覆蓋作者顯示名稱 */
  createdBy?: string;
}

/**
 * 單一公告卡片元件
 * 顯示標題、截斷內容、作者、時間，可點擊觸發 onClick
 * 支援刪除按鈕和自訂操作
 */
export const AnnouncementCard = ({
  announcement,
  onClick,
  maxContentLength = 200,
  formatDate,
  onDelete,
  canDelete,
  actions,
  createdBy,
}: AnnouncementCardProps) => {
  const displayContent =
    maxContentLength > 0 && announcement.content.length > maxContentLength
      ? announcement.content.substring(0, maxContentLength) + "..."
      : announcement.content;

  const formattedDate = formatDate
    ? formatDate(announcement.created_at)
    : new Date(announcement.created_at).toLocaleDateString();

  const authorName = createdBy ?? announcement.author?.username;
  const hasActions = actions || (canDelete && onDelete);

  const renderContent = () => (
    <>
      <div className={styles.header}>
        <div className={styles.title}>{announcement.title}</div>
        {hasActions && (
          <div className={styles.actions}>
            {actions}
            {canDelete && onDelete && (
              <Button
                kind="ghost"
                size="sm"
                renderIcon={TrashCan}
                hasIconOnly
                iconDescription="刪除公告"
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  onDelete(announcement.id);
                }}
                className={styles.deleteButton}
              />
            )}
          </div>
        )}
      </div>
      <div className={styles.content}>{displayContent}</div>
      <div className={styles.meta}>
        {authorName && `${authorName} • `}{formattedDate}
      </div>
    </>
  );

  if (onClick && !hasActions) {
    return (
      <ClickableTile className={styles.card} onClick={onClick}>
        {renderContent()}
      </ClickableTile>
    );
  }

  return (
    <div className={`${styles.card} ${onClick ? styles.clickable : ""}`} onClick={onClick}>
      {renderContent()}
    </div>
  );
};

export default AnnouncementCard;
