import { Button } from "@carbon/react";
import { Add, Bullhorn } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { ClassroomAnnouncement } from "@/core/entities/classroom.entity";
import { EmptyState } from "@/shared/ui/EmptyState";
import { AnnouncementScheduleCard } from "@/shared/ui/scheduleCard";

interface AnnouncementSectionProps {
  announcements: ClassroomAnnouncement[];
  isPrivileged: boolean;
  onCreateClick: () => void;
  onView: (announcement: ClassroomAnnouncement) => void;
  compactEmpty?: boolean;
  title?: string;
  description?: string;
  groupPinned?: boolean;
}

export const AnnouncementSection: React.FC<AnnouncementSectionProps> = ({
  announcements,
  isPrivileged,
  onCreateClick,
  onView,
  compactEmpty = false,
  title,
  description,
  groupPinned = false,
}) => {
  const { t } = useTranslation("classroom");
  const pinnedAnnouncements = announcements.filter(
    (announcement) => announcement.isPinned,
  );
  const regularAnnouncements = announcements.filter(
    (announcement) => !announcement.isPinned,
  );
  const shouldGroupPinned = groupPinned && pinnedAnnouncements.length > 0;

  const renderAnnouncementList = (items: ClassroomAnnouncement[]) => (
    <div className="classroom-admin-announcement-list">
      {items.map((announcement) => (
        <AnnouncementScheduleCard
          key={announcement.id}
          announcement={announcement}
          onClick={() => onView(announcement)}
        />
      ))}
    </div>
  );

  return (
    <section className="classroom-admin-section">
      <div className="classroom-admin-section__header">
        <div className="classroom-admin-section__title">
          <h3>{title ?? t("announcements")}</h3>
          {description ? <p>{description}</p> : null}
        </div>
        {isPrivileged && (
          <Button
            kind="ghost"
            size="sm"
            renderIcon={Add}
            onClick={onCreateClick}
          >
            {t("createAnnouncement")}
          </Button>
        )}
      </div>
      {announcements.length === 0 ? (
        <EmptyState
          icon={Bullhorn}
          title={t("noAnnouncements")}
          compact={compactEmpty}
        />
      ) : shouldGroupPinned ? (
        <div className="classroom-admin-announcement-groups">
          <div className="classroom-admin-announcement-group">
            <h4>{t("announcementPinned", "置頂公告")}</h4>
            {renderAnnouncementList(pinnedAnnouncements)}
          </div>
          {regularAnnouncements.length > 0 ? (
            <div className="classroom-admin-announcement-group">
              <h4>{t("announcementAll", "全部公告")}</h4>
              {renderAnnouncementList(regularAnnouncements)}
            </div>
          ) : null}
        </div>
      ) : (
        renderAnnouncementList(announcements)
      )}
    </section>
  );
};
