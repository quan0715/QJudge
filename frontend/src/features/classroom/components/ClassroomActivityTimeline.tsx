import { useEffect, useLayoutEffect, useRef } from "react";
import { Tag } from "@carbon/react";
import {
  Bullhorn,
  Calendar,
  CheckmarkFilled,
  InProgress,
  Archive,
} from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { ClassroomAnnouncement } from "@/core/entities/classroom.entity";
import {
  getContestState,
  getContestStateColor,
  getContestStateLabel,
  type ContestDisplayState,
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

// ── Contest state → icon / bar-color mapping ──────────────────────────────────

type ContestBarVariant = "upcoming" | "running" | "ended" | "archived";

function getContestBarVariant(state: ContestDisplayState): ContestBarVariant {
  if (state === "running") return "running";
  if (state === "ended") return "ended";
  if (state === "archived") return "archived";
  return "upcoming";
}

function ContestStateIcon({ state, className }: { state: ContestDisplayState; className?: string }) {
  const variant = getContestBarVariant(state);
  const props = { size: 16, className };
  switch (variant) {
    case "running":   return <InProgress {...props} />;
    case "ended":     return <CheckmarkFilled {...props} />;
    case "archived":  return <Archive {...props} />;
    default:          return <Calendar {...props} />;
  }
}

// ── Event row components ──────────────────────────────────────────────────────

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
  const variant = getContestBarVariant(state);

  return (
    <button
      type="button"
      className={`cal-list__event cal-list__event--contest cal-list__event--${variant}`}
      onClick={() => onOpenContest(contest.contestId)}
    >
      <span className="cal-list__event-icon-col" aria-hidden>
        <ContestStateIcon state={state} className="cal-list__event-icon" />
      </span>
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
      <span className="cal-list__event-icon-col" aria-hidden>
        <Bullhorn size={16} className="cal-list__event-icon" />
      </span>
      <span className="cal-list__event-body">
        <span className="cal-list__event-name">{announcement.title}</span>
        <span className="cal-list__event-time">
          {formatDateTime(announcement.createdAt, DATE_FORMATS.SHORT)}
        </span>
      </span>
      <Tag type="purple" size="sm" className="cal-list__event-tag">
        {t("activitySchedule.announcementLabel", "公告")}
      </Tag>
    </button>
  );
}

// ── Main timeline component ───────────────────────────────────────────────────

export const ClassroomActivityTimeline: React.FC<ClassroomActivityTimelineProps> = ({
  rows,
  onOpenContest,
  onViewAnnouncement,
  onLoadEarlier,
  onLoadLater,
}) => {
  const { t } = useTranslation("classroom");
  const scrollRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLLIElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);

  // Preserve scroll position when prepending earlier rows
  const pendingPrependHeightRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (pendingPrependHeightRef.current !== null && el) {
      el.scrollTop += el.scrollHeight - pendingPrependHeightRef.current;
      pendingPrependHeightRef.current = null;
    }
  }, [rows]);

  // Scroll to today on first mount
  useEffect(() => {
    if (todayRef.current && scrollRef.current) {
      scrollRef.current.scrollTop =
        todayRef.current.offsetTop - scrollRef.current.offsetTop;
    }
  }, []);

  // Keep stable refs to callbacks so IntersectionObserver doesn't need recreating
  const onLoadEarlierRef = useRef(onLoadEarlier);
  const onLoadLaterRef = useRef(onLoadLater);
  useEffect(() => { onLoadEarlierRef.current = onLoadEarlier; }, [onLoadEarlier]);
  useEffect(() => { onLoadLaterRef.current = onLoadLater; }, [onLoadLater]);

  // Debounce flags to avoid rapid-fire loading
  const loadingRef = useRef(false);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || loadingRef.current) continue;
          loadingRef.current = true;
          setTimeout(() => { loadingRef.current = false; }, 400);

          if (entry.target === topSentinelRef.current) {
            pendingPrependHeightRef.current = root.scrollHeight;
            onLoadEarlierRef.current();
          } else if (entry.target === bottomSentinelRef.current) {
            onLoadLaterRef.current();
          }
        }
      },
      { root, threshold: 0, rootMargin: "60px 0px 60px 0px" },
    );

    if (topSentinelRef.current) observer.observe(topSentinelRef.current);
    if (bottomSentinelRef.current) observer.observe(bottomSentinelRef.current);

    return () => observer.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const hasEvents = rows.some((r) => r.events.length > 0);

  return (
    <section className="cal-list" aria-labelledby="cal-list-heading">
      <h2 id="cal-list-heading" className="cal-list__heading">
        {t("activitySchedule.timelineHeading", "活動時間軸")}
      </h2>

      <div ref={scrollRef} className="cal-list__scroll">
        {/* Top sentinel – triggers earlier load */}
        <div ref={topSentinelRef} className="cal-list__sentinel" aria-hidden />

        {hasEvents ? (
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
                <div className="cal-list__date-col" aria-hidden>
                  <span className="cal-list__weekday">
                    {row.date.toLocaleDateString(undefined, { weekday: "short" })}
                  </span>
                  <span className="cal-list__date-num">{row.date.getDate()}</span>
                </div>

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
        ) : (
          <EmptyState
            icon={Trophy}
            title={t("activitySchedule.emptyAll", "教室目前沒有任何活動或公告")}
            compact
          />
        )}

        {/* Bottom sentinel – triggers later load */}
        <div ref={bottomSentinelRef} className="cal-list__sentinel" aria-hidden />
      </div>
    </section>
  );
};
