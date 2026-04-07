import { useEffect, useRef } from "react";
import { Tag } from "@carbon/react";
import { Bullhorn, ChevronDown, ChevronUp } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { ClassroomAnnouncement } from "@/core/entities/classroom.entity";
import {
  getContestState,
  getContestStateColor,
  getContestStateLabel,
} from "@/core/entities/contest.entity";
import type { CalendarDayRow, TimelineEvent } from "@/features/classroom/domain/classroomActivityTimeline";
import { getBoundContestTimeRange } from "@/features/classroom/domain/classroomActivityTimeline";
import { formatDateTime, DATE_FORMATS } from "@/i18n/dateUtils";
import { EmptyState } from "@/shared/ui/EmptyState";
import { Trophy } from "@carbon/icons-react";

export interface ClassroomActivityTimelineProps {
  rows: CalendarDayRow[];
  onOpenContest: (contestId: string) => void;
  onViewAnnouncement: (announcement: ClassroomAnnouncement) => void;
  onLoadEarlier: () => void;
  onLoadLater: () => void;
}

function formatWeekday(date: Date): string {
  return formatDateTime(date, {
    weekday: "short",
  });
}

function ContestEventItem({
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
    <button
      type="button"
      className="cal-list__event cal-list__event--contest"
      onClick={() => onOpenContest(contest.contestId)}
    >
      <span className="cal-list__event-bar cal-list__event-bar--contest" aria-hidden />
      <span className="cal-list__event-body">
        <span className="cal-list__event-name">{contest.contestName}</span>
        <span className="cal-list__event-time">
          {formatDateTime(startIso, DATE_FORMATS.SHORT)}
          {" — "}
          {formatDateTime(endIso, DATE_FORMATS.SHORT)}
        </span>
      </span>
      <Tag type={getContestStateColor(state)} size="sm" className="cal-list__event-tag">
        {getContestStateLabel(state)}
      </Tag>
    </button>
  );
}

function AnnouncementEventItem({
  event,
  onViewAnnouncement,
}: {
  event: Extract<TimelineEvent, { type: "announcement" }>;
  onViewAnnouncement: (a: ClassroomAnnouncement) => void;
}) {
  const { announcement } = event;
  const { t } = useTranslation("classroom");

  return (
    <button
      type="button"
      className="cal-list__event cal-list__event--announcement"
      onClick={() => onViewAnnouncement(announcement)}
    >
      <span className="cal-list__event-bar cal-list__event-bar--announcement" aria-hidden />
      <span className="cal-list__event-body">
        <span className="cal-list__event-name">
          <Bullhorn size={14} className="cal-list__event-icon" aria-hidden />
          {announcement.title}
        </span>
        <span className="cal-list__event-time">
          {formatDateTime(announcement.createdAt, DATE_FORMATS.SHORT)}
        </span>
      </span>
      <Tag type="blue" size="sm" className="cal-list__event-tag">
        {t("activitySchedule.announcementLabel", "公告")}
      </Tag>
    </button>
  );
}

export const ClassroomActivityTimeline: React.FC<ClassroomActivityTimelineProps> = ({
  rows,
  onOpenContest,
  onViewAnnouncement,
  onLoadEarlier,
  onLoadLater,
}) => {
  const { t } = useTranslation("classroom");
  const todayRef = useRef<HTMLLIElement>(null);
  const hasEvents = rows.some((r) => r.events.length > 0);

  useEffect(() => {
    if (todayRef.current) {
      todayRef.current.scrollIntoView({ block: "start", behavior: "instant" });
    }
  }, []);

  return (
    <section
      className="cal-list"
      aria-labelledby="cal-list-heading"
    >
      <h2 id="cal-list-heading" className="cal-list__heading">
        {t("activitySchedule.timelineHeading", "活動時間軸")}
      </h2>

      <button
        type="button"
        className="cal-list__load-btn"
        onClick={onLoadEarlier}
      >
        <ChevronUp size={16} />
        {t("activitySchedule.loadEarlier", "顯示更早")}
      </button>

      {!hasEvents ? (
        <EmptyState
          icon={Trophy}
          title={t("activitySchedule.emptyAll", "教室目前沒有任何活動或公告")}
          compact
        />
      ) : (
        <ol className="cal-list__days">
          {rows.map((row) => (
            <li
              key={row.dateKey}
              ref={row.isToday ? todayRef : undefined}
              className={[
                "cal-list__day",
                row.isToday ? "cal-list__day--today" : "",
                row.events.length === 0 ? "cal-list__day--empty" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {/* Left date column */}
              <div className="cal-list__date-col" aria-hidden>
                <span className="cal-list__weekday">{formatWeekday(row.date)}</span>
                <span className="cal-list__date-num">{row.date.getDate()}</span>
              </div>

              {/* Right events column */}
              <div className="cal-list__events-col">
                {row.events.map((event, idx) =>
                  event.type === "contest" ? (
                    <ContestEventItem
                      key={event.contest.contestId}
                      event={event}
                      onOpenContest={onOpenContest}
                    />
                  ) : (
                    <AnnouncementEventItem
                      key={`ann-${event.announcement.id}-${idx}`}
                      event={event}
                      onViewAnnouncement={onViewAnnouncement}
                    />
                  ),
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      <button
        type="button"
        className="cal-list__load-btn"
        onClick={onLoadLater}
      >
        <ChevronDown size={16} />
        {t("activitySchedule.loadLater", "顯示更晚")}
      </button>
    </section>
  );
};
