import type { ReactNode } from "react";
import { Button, ClickableTile } from "@carbon/react";
import { TrashCan, Calendar, Pin } from "@carbon/icons-react";
import { stripMarkdown } from "@/shared/utils";
import styles from "./AnnouncementCard.module.scss";

export interface AnnouncementCardProps {
  /** 公告資料 (核心屬性) */
  announcement: {
    id: number | string;
    title: string;
    content: string;
    isPinned?: boolean;
    created_at?: string;
    createdAt?: string;
    updated_at?: string;
    updatedAt?: string;
    author?: { username: string; [key: string]: any };
    [key: string]: any;
  };
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
  /** 是否顯示 PIN 圖示 (如果有 pinned 屬性) */
  showPin?: boolean;
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
  showPin = true,
}: AnnouncementCardProps) => {
  const displayContent =
    maxContentLength > 0
      ? stripMarkdown(announcement.content, maxContentLength)
      : announcement.content;

  const dateStr = announcement.created_at || announcement.createdAt || "";
  const formattedDate = formatDate
    ? formatDate(dateStr)
    : dateStr
      ? new Date(dateStr).toLocaleDateString()
      : "";

  const authorName =
    createdBy ?? announcement.author?.username;
  const hasActions = actions || (canDelete && onDelete);

  const renderContent = () => (
    <>
      <div className={styles.header}>
        <div className={styles.title}>
          {showPin && announcement.isPinned && (
            <Pin size={14} className={styles.pinIcon} />
          )}
          {announcement.title}
        </div>
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
        <span className={styles.dateInfo}>
          <Calendar size={12} className={styles.calendarIcon} />
          {authorName && `${authorName} • `}{formattedDate}
        </span>
      </div>
    </>
  );

  const cardClassName = `${styles.card} ${onClick ? styles.clickable : ""} ${
    announcement.isPinned ? styles.pinned : ""
  }`;

  if (onClick && !hasActions) {
    return (
      <ClickableTile className={cardClassName} onClick={onClick}>
        {renderContent()}
      </ClickableTile>
    );
  }

  return (
    <div className={cardClassName} onClick={onClick}>
      {renderContent()}
    </div>
  );
};

export default AnnouncementCard;
