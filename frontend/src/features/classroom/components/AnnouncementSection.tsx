import { Button } from "@carbon/react";
import { Add, Bullhorn } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { ClassroomAnnouncement } from "@/core/entities/classroom.entity";
import { EmptyState } from "@/shared/ui/EmptyState";
import { AnnouncementCard } from "./AnnouncementCard";

interface AnnouncementSectionProps {
  announcements: ClassroomAnnouncement[];
  isPrivileged: boolean;
  onCreateClick: () => void;
  onView: (announcement: ClassroomAnnouncement) => void;
  compactEmpty?: boolean;
  title?: string;
}

export const AnnouncementSection: React.FC<AnnouncementSectionProps> = ({
  announcements,
  isPrivileged,
  onCreateClick,
  onView,
  compactEmpty = false,
  title,
}) => {
  const { t } = useTranslation("classroom");
  return (
    <section className="classroom-admin-section">
      <div className="classroom-admin-section__header">
        <div className="classroom-admin-section__title">
          <h3>{title ?? t("announcements")}</h3>
        </div>
        {isPrivileged && (
          <Button kind="ghost" size="sm" renderIcon={Add} onClick={onCreateClick}>
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
      ) : (
        <div className="classroom-admin-announcement-list">
          {announcements.map((announcement) => (
            <AnnouncementCard
              key={announcement.id}
              announcement={announcement}
              onClick={() => onView(announcement)}
            />
          ))}
        </div>
      )}
    </section>
  );
};
