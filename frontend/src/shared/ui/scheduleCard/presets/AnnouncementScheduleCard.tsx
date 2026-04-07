import { Tag } from "@carbon/react";
import { Bullhorn } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { ClassroomAnnouncement } from "@/core/entities/classroom.entity";
import { formatDateTime, DATE_FORMATS } from "@/i18n/dateUtils";
import { ScheduleCard } from "../ScheduleCard";

export interface AnnouncementScheduleCardProps {
  announcement: ClassroomAnnouncement;
  onClick?: () => void;
}

export function AnnouncementScheduleCard({
  announcement,
  onClick,
}: AnnouncementScheduleCardProps) {
  const { t } = useTranslation("classroom");

  return (
    <ScheduleCard.Root onClick={onClick} accentColor="var(--cds-support-info)">
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

      <ScheduleCard.Meta>
        {announcement.createdByUsername
          ? `${announcement.createdByUsername} · `
          : ""}
        {formatDateTime(announcement.createdAt, DATE_FORMATS.DATE_ONLY)}
      </ScheduleCard.Meta>
    </ScheduleCard.Root>
  );
}
