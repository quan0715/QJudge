import { useEffect, useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Trophy } from "@carbon/icons-react";
import type { ClassroomAnnouncement } from "@/core/entities/classroom.entity";
import type { CalendarDayRow, TimelineEvent } from "@/features/classroom/domain/classroomActivityTimeline";
import {
  ContestScheduleCard,
  AnnouncementScheduleCard,
} from "@/shared/ui/scheduleCard";
import { EmptyState } from "@/shared/ui/EmptyState";

export interface ClassroomActivityTimelineProps {
  rows: CalendarDayRow[];
  onOpenContest: (contestId: string) => void;
  onViewAnnouncement: (announcement: ClassroomAnnouncement) => void;
  onLoadEarlier: () => void;
  onLoadLater: () => void;
}

// ── Event dispatcher ──────────────────────────────────────────────────────────

function EventCard({
  event,
  onOpenContest,
  onViewAnnouncement,
}: {
  event: TimelineEvent;
  onOpenContest: (id: string) => void;
  onViewAnnouncement: (a: ClassroomAnnouncement) => void;
}) {
  if (event.type === "contest") {
    return (
      <ContestScheduleCard
        contest={event.contest}
        onClick={() => onOpenContest(event.contest.contestId)}
      />
    );
  }
  return (
    <AnnouncementScheduleCard
      announcement={event.announcement}
      onClick={() => onViewAnnouncement(event.announcement)}
    />
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
  const todayRef  = useRef<HTMLLIElement>(null);
  const topSentinelRef    = useRef<HTMLDivElement>(null);
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

  // Scroll to today row on first mount
  useEffect(() => {
    const scroll = scrollRef.current;
    const today  = todayRef.current;
    if (scroll && today) {
      scroll.scrollTop = today.offsetTop - scroll.offsetTop;
    }
  }, []);

  // Keep stable refs so IntersectionObserver doesn't need recreating
  const onLoadEarlierRef = useRef(onLoadEarlier);
  const onLoadLaterRef   = useRef(onLoadLater);
  useEffect(() => { onLoadEarlierRef.current = onLoadEarlier; }, [onLoadEarlier]);
  useEffect(() => { onLoadLaterRef.current   = onLoadLater;   }, [onLoadLater]);

  // Debounce flag to avoid rapid-fire loading
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

    if (topSentinelRef.current)    observer.observe(topSentinelRef.current);
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
        <div ref={topSentinelRef} className="cal-list__sentinel" aria-hidden />

        {hasEvents ? (
          <ol className="cal-list__days">
            {rows.map((row) => (
              <li
                key={row.dateKey}
                ref={row.isToday ? todayRef : undefined}
                className={[
                  "cal-list__day",
                  row.isToday            ? "cal-list__day--today" : "",
                  row.events.length === 0 ? "cal-list__day--empty" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {/* Left: date column */}
                <div className="cal-list__date-col" aria-hidden>
                  <span className="cal-list__weekday">
                    {row.date.toLocaleDateString(undefined, { weekday: "short" })}
                  </span>
                  <span className="cal-list__date-num">{row.date.getDate()}</span>
                </div>

                {/* Right: event cards */}
                <div className="cal-list__events-col">
                  {row.events.map((event, idx) => (
                    <EventCard
                      key={
                        event.type === "contest"
                          ? event.contest.contestId
                          : `ann-${event.announcement.id}-${idx}`
                      }
                      event={event}
                      onOpenContest={onOpenContest}
                      onViewAnnouncement={onViewAnnouncement}
                    />
                  ))}
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

        <div ref={bottomSentinelRef} className="cal-list__sentinel" aria-hidden />
      </div>
    </section>
  );
};
