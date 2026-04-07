import { Tag } from "@carbon/react";
import { Bullhorn } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { ClassroomAnnouncement } from "@/core/entities/classroom.entity";
import { formatDateTime, DATE_FORMATS } from "@/i18n/dateUtils";
import { ScheduleCard } from "../ScheduleCard";

const stripMarkdown = (md: string, maxLen = 80): string => {
  const plain = md
    .replace(/[#*_~`>\-![\]()]/g, "")
    .replace(/\n+/g, " ")
    .trim();
  return plain.length > maxLen ? `${plain.slice(0, maxLen)}…` : plain;
};

export interface AnnouncementScheduleCardProps {
  announcement: ClassroomAnnouncement;
  onClick?: () => void;
  /** Show time-only (HH:mm) instead of full date+time. Use inside calendar. */
  timeOnly?: boolean;
}

export function AnnouncementScheduleCard({
  announcement,
  onClick,
  timeOnly,
}: AnnouncementScheduleCardProps) {
  const { t } = useTranslation("classroom");

  const preview = stripMarkdown(announcement.content);

  return (
    <ScheduleCard.Root
      onClick={onClick}
      accentColor="var(--cds-border-strong-01)"
    >
      <ScheduleCard.Header
        icon={<Bullhorn size={16} />}
        tag={
          <Tag type="purple" size="sm">
            {t("activitySchedule.announcementLabel", "公告")}
          </Tag>
        }
      >
        {announcement.title}
      </ScheduleCard.Header>

      {preview && (
        <ScheduleCard.Description>{preview}</ScheduleCard.Description>
      )}

      <ScheduleCard.Meta>
        {announcement.createdByUsername
          ? `${announcement.createdByUsername} · `
          : ""}
        {timeOnly
          ? formatDateTime(announcement.createdAt, {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })
          : formatDateTime(announcement.createdAt, DATE_FORMATS.DATE_ONLY)}
      </ScheduleCard.Meta>
    </ScheduleCard.Root>
  );
}
