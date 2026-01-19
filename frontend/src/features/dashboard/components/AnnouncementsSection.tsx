import { useState } from "react";
import { Tile, SkeletonText, Stack } from "@carbon/react";
import { DocumentMultiple_02 } from "@carbon/icons-react";
import {
  AnnouncementCard,
  AnnouncementDetailModal,
} from "@/shared/ui/announcement";
import type { Announcement } from "@/infrastructure/api/repositories/announcement.repository";

export interface AnnouncementsSectionProps {
  /** 公告列表 */
  announcements: Announcement[];
  /** 是否載入中 */
  loading?: boolean;
  /** 區塊標題 */
  title?: string;
  /** 區塊副標題 */
  subtitle?: string;
  /** 無公告時顯示的訊息 */
  emptyMessage?: string;
  /** 日期格式化函式 */
  formatDate?: (dateStr: string) => string;
}

/**
 * Dashboard 公告區塊
 * 組合 AnnouncementCard 並管理 Modal 狀態
 */
export const AnnouncementsSection = ({
  announcements,
  loading = false,
  title = "公告",
  subtitle = "最新公告",
  emptyMessage = "目前沒有公告",
  formatDate,
}: AnnouncementsSectionProps) => {
  const [selectedAnnouncement, setSelectedAnnouncement] =
    useState<Announcement | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const handleCardClick = (announcement: Announcement) => {
    setSelectedAnnouncement(announcement);
    setModalOpen(true);
  };

  const handleModalClose = () => {
    setModalOpen(false);
    setSelectedAnnouncement(null);
  };

  return (
    <>
      <Tile className="dashboard-page__section">
        <div className="dashboard-page__section-header">
          <DocumentMultiple_02 size={24} />
          <div>
            <h4 className="dashboard-page__section-title">{title}</h4>
            <p className="dashboard-page__section-subtitle">{subtitle}</p>
          </div>
        </div>
        {loading ? (
          <SkeletonText paragraph lineCount={3} />
        ) : announcements.length > 0 ? (
          <Stack gap={4}>
            {announcements.map((announcement) => (
              <AnnouncementCard
                key={announcement.id}
                announcement={announcement}
                onClick={() => handleCardClick(announcement)}
                formatDate={formatDate}
              />
            ))}
          </Stack>
        ) : (
          <p className="dashboard-page__empty">{emptyMessage}</p>
        )}
      </Tile>

      <AnnouncementDetailModal
        announcement={selectedAnnouncement}
        open={modalOpen}
        onClose={handleModalClose}
        formatDate={formatDate}
      />
    </>
  );
};

export default AnnouncementsSection;
