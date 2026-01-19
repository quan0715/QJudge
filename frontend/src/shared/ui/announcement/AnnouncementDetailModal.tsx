import { Modal } from "@carbon/react";
import type { Announcement } from "@/infrastructure/api/repositories/announcement.repository";
import styles from "./AnnouncementDetailModal.module.scss";

export interface AnnouncementDetailModalProps {
  /** 要顯示的公告，null 時不顯示 */
  announcement: Announcement | null;
  /** Modal 是否開啟 */
  open: boolean;
  /** 關閉 Modal 的回調 */
  onClose: () => void;
  /** 日期格式化函式 */
  formatDate?: (dateStr: string) => string;
  /** 關閉按鈕文字 */
  closeButtonText?: string;
}

/**
 * 公告詳情 Modal
 * 顯示公告的完整內容
 */
export const AnnouncementDetailModal = ({
  announcement,
  open,
  onClose,
  formatDate,
  closeButtonText = "關閉",
}: AnnouncementDetailModalProps) => {
  if (!announcement) return null;

  const formattedDate = formatDate
    ? formatDate(announcement.created_at)
    : new Date(announcement.created_at).toLocaleString();

  return (
    <Modal
      open={open}
      onRequestClose={onClose}
      modalHeading={announcement.title}
      passiveModal
      size="md"
      primaryButtonText={closeButtonText}
      onRequestSubmit={onClose}
    >
      <div className={styles.modal}>
        <div className={styles.meta}>
          {announcement.author?.username} • {formattedDate}
        </div>
        <div className={styles.content}>{announcement.content}</div>
      </div>
    </Modal>
  );
};

export default AnnouncementDetailModal;
