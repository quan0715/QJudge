import type { ClassroomAnnouncement } from "@/core/entities/classroom.entity";
import { AnnouncementCard as SharedAnnouncementCard } from "@/shared/ui/announcement/AnnouncementCard";

interface AnnouncementCardProps {
  announcement: ClassroomAnnouncement;
  onClick: () => void;
}

export const AnnouncementCard: React.FC<AnnouncementCardProps> = ({
  announcement,
  onClick,
}) => {
  return (
    <SharedAnnouncementCard
      announcement={announcement}
      onClick={onClick}
      maxContentLength={120}
      createdBy={announcement.createdByUsername || undefined}
    />
  );
};
