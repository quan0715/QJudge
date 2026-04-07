import { useEffect, useRef } from "react";
import { ClickableTile, Tag } from "@carbon/react";
import { Bullhorn, Trophy } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { ClassroomAnnouncement } from "@/core/entities/classroom.entity";
import {
  getContestState,
  getContestStateColor,
  getContestStateLabel,
} from "@/core/entities/contest.entity";
import type { TimelineDayGroup, TimelineEvent } from "@/features/classroom/domain/classroomActivityTimeline";
import { getBoundContestTimeRange } from "@/features/classroom/domain/classroomActivityTimeline";
import { formatDateTime, DATE_FORMATS } from "@/i18n/dateUtils";
import { EmptyState } from "@/shared/ui/EmptyState";

export interface ClassroomActivityTimelineProps {
  groups: TimelineDayGroup[];
  onOpenContest: (contestId: string) => void;
  onViewAnnouncement: (announcement: ClassroomAnnouncement) => void;
}

function formatDayHeading(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map((x) => Number.parseInt(x, 10));
  if (!y || !m || !d) return dateKey;
  const ms = new Date(y, m - 1, d, 12, 0, 0, 0).getTime();
  return formatDateTime(ms, DATE_FORMATS.DATE_ONLY);
}

function ContestEventRow({
  event,
  onOpenContest,
}: {
  event: Extract<TimelineEvent, { type: "contest" }>;
  onOpenContest: (id: string) => void;
}) {
  const { contest } = event;
  const startIso = contest.contestStartTime || contest.boundAt;
  const endIso = contest.contestEndTime || contest.boundAt;
  const { startMs, endMs } = getBoundContestTimeRange(contest);
  const state = getContestState({
    status: contest.contestStatus,
    startTime: isNaN(startMs) ? undefined : new Date(startMs).toISOString(),
    endTime: isNaN(endMs) ? undefined : new Date(endMs).toISOString(),
  });

  return (
    <ClickableTile
      className="classroom-activity-schedule__event-tile"
      onClick={() => onOpenContest(contest.contestId)}
    >
      <div className="classroom-activity-schedule__event-header">
        <span className="classroom-activity-schedule__event-name">{contest.contestName}</span>
        <Tag type={getContestStateColor(state)} size="sm">
          {getContestStateLabel(state)}
        </Tag>
      </div>
      <div className="classroom-activity-schedule__event-meta">
        {formatDateTime(startIso, DATE_FORMATS.SHORT)} — {formatDateTime(endIso, DATE_FORMATS.SHORT)}
      </div>
    </ClickableTile>
  );
}

function AnnouncementEventRow({
  event,
  onViewAnnouncement,
}: {
  event: Extract<TimelineEvent, { type: "announcement" }>;
  onViewAnnouncement: (a: ClassroomAnnouncement) => void;
}) {
  const { announcement } = event;
  const { t } = useTranslation("classroom");

  return (
    <ClickableTile
      className="classroom-activity-schedule__event-tile classroom-activity-schedule__event-tile--announcement"
      onClick={() => onViewAnnouncement(announcement)}
    >
      <div className="classroom-activity-schedule__event-header">
        <Bullhorn size={16} className="classroom-activity-schedule__event-icon" />
        <span className="classroom-activity-schedule__event-name">{announcement.title}</span>
        <Tag type="blue" size="sm">
          {t("activitySchedule.announcementLabel", "公告")}
        </Tag>
      </div>
      <div className="classroom-activity-schedule__event-meta">
        {formatDateTime(announcement.createdAt, DATE_FORMATS.SHORT)}
      </div>
    </ClickableTile>
  );
}

export const ClassroomActivityTimeline: React.FC<ClassroomActivityTimelineProps> = ({
  groups,
  onOpenContest,
  onViewAnnouncement,
}) => {
  const { t } = useTranslation("classroom");
  const todayRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (todayRef.current) {
      todayRef.current.scrollIntoView({ block: "start", behavior: "instant" });
    }
  }, []);

  if (groups.length === 0) {
    return (
      <section
        className="classroom-admin-section classroom-activity-schedule__timeline"
        aria-labelledby="classroom-activity-timeline-heading"
      >
        <h2
          id="classroom-activity-timeline-heading"
          className="classroom-activity-schedule__timeline-heading"
        >
          {t("activitySchedule.timelineHeading", "活動時間軸")}
        </h2>
        <EmptyState
          icon={Trophy}
          title={t("activitySchedule.emptyAll", "教室目前沒有任何活動或公告")}
          compact
        />
      </section>
    );
  }

  return (
    <section
      className="classroom-admin-section classroom-activity-schedule__timeline"
      aria-labelledby="classroom-activity-timeline-heading"
    >
      <h2
        id="classroom-activity-timeline-heading"
        className="classroom-activity-schedule__timeline-heading"
      >
        {t("activitySchedule.timelineHeading", "活動時間軸")}
      </h2>
      <ol className="classroom-activity-schedule__timeline-list">
        {groups.map((group) => (
          <li
            key={group.dateKey}
            ref={group.isToday ? todayRef : undefined}
            className={[
              "classroom-activity-schedule__day",
              group.isToday ? "classroom-activity-schedule__day--today" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <h3 className="classroom-activity-schedule__day-label">
              {group.isToday
                ? `${formatDayHeading(group.dateKey)} · ${t("activitySchedule.today", "今天")}`
                : formatDayHeading(group.dateKey)}
            </h3>
            <ul className="classroom-activity-schedule__events">
              {group.events.map((event, idx) => (
                <li key={event.type === "contest" ? event.contest.contestId : `ann-${event.announcement.id}-${idx}`}>
                  {event.type === "contest" ? (
                    <ContestEventRow event={event} onOpenContest={onOpenContest} />
                  ) : (
                    <AnnouncementEventRow event={event} onViewAnnouncement={onViewAnnouncement} />
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  );
};
