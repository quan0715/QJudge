import { ClickableTile } from "@carbon/react";
import { Calendar, Pin } from "@carbon/icons-react";
import type { ClassroomAnnouncement } from "@/core/entities/classroom.entity";

const stripMarkdown = (md: string, maxLen = 120): string => {
  const plain = md
    .replace(/[#*_~`>\-![\]()]/g, "")
    .replace(/\n+/g, " ")
    .trim();
  return plain.length > maxLen ? `${plain.slice(0, maxLen)}…` : plain;
};

interface AnnouncementCardProps {
  announcement: ClassroomAnnouncement;
  onClick: () => void;
}

export const AnnouncementCard: React.FC<AnnouncementCardProps> = ({ announcement, onClick }) => {
  const preview = stripMarkdown(announcement.content);

  return (
    <ClickableTile
      onClick={onClick}
      className={`classroom-admin-announcement-card${
        announcement.isPinned ? " classroom-admin-announcement-card--pinned" : ""
      }`}
    >
      <div className="classroom-admin-announcement-card__head">
        {announcement.isPinned && <Pin size={14} className="classroom-admin-announcement-card__pin" />}
        <h4>{announcement.title}</h4>
        <span className="classroom-admin-announcement-card__date">
          <Calendar size={12} />
          {new Date(announcement.createdAt).toLocaleDateString()}
        </span>
      </div>
      {preview && (
        <p className="classroom-admin-announcement-card__preview">{preview}</p>
      )}
    </ClickableTile>
  );
};
