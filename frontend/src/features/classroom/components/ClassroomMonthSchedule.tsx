import { useMemo, type CSSProperties } from "react";
import { Button, ContentSwitcher, IconSwitch } from "@carbon/react";
import {
  Calendar,
  CalendarHeatMap,
  ChevronLeft,
  ChevronRight,
  Trophy,
} from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/shared/ui/EmptyState";
import { ContestScheduleCard } from "@/shared/ui/scheduleCard";
import {
  getBoundContestTimeRange,
  type ClassroomMonthScheduleCell,
  type ClassroomMonthScheduleEvent,
} from "@/features/classroom/domain/classroomActivityTimeline";

export type ClassroomScheduleViewMode = "week" | "month";

interface ClassroomMonthScheduleProps {
  cells: ClassroomMonthScheduleCell[];
  rangeAnchor: Date;
  viewMode: ClassroomScheduleViewMode;
  selectedDateKey: string;
  onViewModeChange: (viewMode: ClassroomScheduleViewMode) => void;
  onSelectDate: (dateKey: string) => void;
  onOpenContest: (contestId: string) => void;
  onPreviousRange: () => void;
  onNextRange: () => void;
}

const MAX_EVENTS_PER_DAY = 2;
const MIN_EVENT_MINUTES = 30;

const formatEventTime = (date: Date, locale: string) =>
  date.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
  });

const formatMonthTitle = (date: Date, locale: string) =>
  date.toLocaleDateString(locale, { year: "numeric", month: "long" });

const formatShortDate = (date: Date, locale: string) =>
  date.toLocaleDateString(locale, { month: "short", day: "numeric" });

const formatWeekTitle = (cells: ClassroomMonthScheduleCell[], locale: string) => {
  const first = cells[0]?.date;
  const last = cells[cells.length - 1]?.date;
  if (!first || !last) return "";
  if (first.getFullYear() === last.getFullYear()) {
    return `${first.getFullYear()} ${formatShortDate(first, locale)} - ${formatShortDate(last, locale)}`;
  }
  return `${first.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" })} - ${last.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" })}`;
};

const formatSelectedDate = (date: Date, locale: string) =>
  date.toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    weekday: "short",
  });

const formatWeekdayDate = (date: Date, locale: string) =>
  date.toLocaleDateString(locale, {
    weekday: "short",
    day: "numeric",
  });

const formatHourLabel = (hour: number, locale: string) =>
  new Date(0, 0, 1, hour).toLocaleTimeString(locale, {
    hour: "numeric",
  });

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

function getEventRangeMs(event: ClassroomMonthScheduleEvent) {
  const { startMs, endMs } = getBoundContestTimeRange(event.contest);
  const safeStartMs = Number.isNaN(startMs) ? event.sortMs : startMs;
  const safeEndMs =
    Number.isNaN(endMs) || endMs <= safeStartMs
      ? safeStartMs + MIN_EVENT_MINUTES * 60_000
      : endMs;
  return { startMs: safeStartMs, endMs: safeEndMs };
}

function getWeekHourRange(cells: ClassroomMonthScheduleCell[]) {
  const ranges = cells.flatMap((cell) =>
    cell.events.map((event) => getEventRangeMs(event)),
  );
  if (ranges.length === 0) return { startHour: 8, endHour: 18 };

  const minStartHour = Math.min(
    ...ranges.map(({ startMs }) => new Date(startMs).getHours()),
  );
  const maxEndHour = Math.max(
    ...ranges.map(({ endMs }) => {
      const end = new Date(endMs);
      return end.getHours() + (end.getMinutes() > 0 ? 1 : 0);
    }),
  );

  return {
    startHour: clamp(minStartHour - 1, 0, 23),
    endHour: clamp(Math.max(maxEndHour + 1, minStartHour + 2), 1, 24),
  };
}

function getWeekEventStyle(
  event: ClassroomMonthScheduleEvent,
  cellDate: Date,
  startHour: number,
  endHour: number,
): CSSProperties {
  const { startMs, endMs } = getEventRangeMs(event);
  const dayStart = new Date(cellDate);
  dayStart.setHours(startHour, 0, 0, 0);
  const dayEnd = new Date(cellDate);
  dayEnd.setHours(endHour, 0, 0, 0);

  const totalMs = Math.max(dayEnd.getTime() - dayStart.getTime(), 1);
  const visibleStartMs = clamp(startMs, dayStart.getTime(), dayEnd.getTime());
  const visibleEndMs = clamp(
    Math.max(endMs, visibleStartMs + MIN_EVENT_MINUTES * 60_000),
    dayStart.getTime(),
    dayEnd.getTime(),
  );

  return {
    "--event-top": `${((visibleStartMs - dayStart.getTime()) / totalMs) * 100}%`,
    "--event-height": `${Math.max(
      ((visibleEndMs - visibleStartMs) / totalMs) * 100,
      8,
    )}%`,
  } as CSSProperties;
}

export const ClassroomMonthSchedule: React.FC<ClassroomMonthScheduleProps> = ({
  cells,
  rangeAnchor,
  viewMode,
  selectedDateKey,
  onViewModeChange,
  onSelectDate,
  onOpenContest,
  onPreviousRange,
  onNextRange,
}) => {
  const { t, i18n } = useTranslation("classroom");
  const locale = i18n.language;

  const weekdayLabels = useMemo(() => {
    const base = new Date(2026, 0, 4); // Sunday
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(base);
      date.setDate(base.getDate() + index);
      return date.toLocaleDateString(locale, { weekday: "short" });
    });
  }, [locale]);

  const selectedCell =
    cells.find((cell) => cell.dateKey === selectedDateKey) ?? cells[0];
  const hasEvents = cells.some((cell) => cell.events.length > 0);
  const rangeLabel =
    viewMode === "week"
      ? formatWeekTitle(cells, locale)
      : formatMonthTitle(rangeAnchor, locale);
  const previousLabel =
    viewMode === "week"
      ? t("activitySchedule.previousWeek", "上一週")
      : t("activitySchedule.previousMonth", "上一個月");
  const nextLabel =
    viewMode === "week"
      ? t("activitySchedule.nextWeek", "下一週")
      : t("activitySchedule.nextMonth", "下一個月");

  return (
    <section
      className={`classroom-month-schedule classroom-month-schedule--${viewMode}`}
      aria-labelledby="classroom-month-schedule-heading"
    >
      <div className="classroom-month-schedule__header">
        <div>
          <p className="classroom-month-schedule__eyebrow">
            {t("activitySchedule.monthEyebrow", "Schedule")}
          </p>
          <h2
            id="classroom-month-schedule-heading"
            className="classroom-month-schedule__heading"
          >
            {viewMode === "week"
              ? t("activitySchedule.weekHeading", "本週排程")
              : t("activitySchedule.monthHeading", "本月排程")}
          </h2>
        </div>
        <div className="classroom-month-schedule__header-actions">
          <ContentSwitcher
            size="sm"
            className="classroom-month-schedule__view-switcher"
            selectedIndex={viewMode === "week" ? 0 : 1}
            onChange={(event) =>
              onViewModeChange(event.index === 0 ? "week" : "month")
            }
            aria-label={t("activitySchedule.viewModeLabel", "排程檢視模式")}
          >
            <IconSwitch
              name="week"
              text={t("activitySchedule.viewModeWeek", "週")}
              align="bottom"
            >
              <Calendar size={16} />
            </IconSwitch>
            <IconSwitch
              name="month"
              text={t("activitySchedule.viewModeMonth", "月")}
              align="bottom"
            >
              <CalendarHeatMap size={16} />
            </IconSwitch>
          </ContentSwitcher>
          <div className="classroom-month-schedule__controls">
            <Button
              kind="ghost"
              size="sm"
              hasIconOnly
              renderIcon={ChevronLeft}
              iconDescription={previousLabel}
              onClick={onPreviousRange}
            />
            <span
              className="classroom-month-schedule__month-label"
              aria-live="polite"
            >
              {rangeLabel}
            </span>
            <Button
              kind="ghost"
              size="sm"
              hasIconOnly
              renderIcon={ChevronRight}
              iconDescription={nextLabel}
              onClick={onNextRange}
            />
          </div>
        </div>
      </div>

      {viewMode === "week" ? (
        <WeekScheduleGrid
          cells={cells}
          selectedDateKey={selectedDateKey}
          rangeLabel={rangeLabel}
          locale={locale}
          onSelectDate={onSelectDate}
          onOpenContest={onOpenContest}
        />
      ) : (
        <MonthScheduleGrid
          cells={cells}
          weekdayLabels={weekdayLabels}
          selectedDateKey={selectedDateKey}
          rangeLabel={rangeLabel}
          onSelectDate={onSelectDate}
          onOpenContest={onOpenContest}
        />
      )}

      {viewMode === "month" ? (
        <section
          className="classroom-month-schedule__detail"
          aria-labelledby="classroom-month-schedule-detail-heading"
        >
          <div className="classroom-month-schedule__detail-header">
            <Calendar size={16} />
            <h3 id="classroom-month-schedule-detail-heading">
              {t("activitySchedule.selectedDateEvents", "選取日期事件")}
            </h3>
            {selectedCell ? (
              <span>{formatSelectedDate(selectedCell.date, locale)}</span>
            ) : null}
          </div>

          {selectedCell?.events.length ? (
            <div className="classroom-month-schedule__detail-list">
              {selectedCell.events.map((event) => (
                <ContestScheduleCard
                  key={event.contest.contestId}
                  contest={event.contest}
                  onClick={() => onOpenContest(event.contest.contestId)}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={hasEvents ? Calendar : Trophy}
              title={
                hasEvents
                  ? t("activitySchedule.noEventsOnDate", "這天沒有考試或競賽")
                  : t("activitySchedule.emptyMonth", "本月沒有考試或競賽")
              }
              compact
            />
          )}
        </section>
      ) : null}
    </section>
  );
};

function MonthScheduleGrid({
  cells,
  weekdayLabels,
  selectedDateKey,
  rangeLabel,
  onSelectDate,
  onOpenContest,
}: {
  cells: ClassroomMonthScheduleCell[];
  weekdayLabels: string[];
  selectedDateKey: string;
  rangeLabel: string;
  onSelectDate: (dateKey: string) => void;
  onOpenContest: (contestId: string) => void;
}) {
  const rows: ClassroomMonthScheduleCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7));
  }

  return (
    <div
      className="classroom-month-schedule__grid"
      role="grid"
      aria-label={rangeLabel}
    >
      <div className="classroom-month-schedule__header-row" role="row">
        {weekdayLabels.map((label) => (
          <div
            key={label}
            className="classroom-month-schedule__weekday"
            role="columnheader"
          >
            {label}
          </div>
        ))}
      </div>

      {rows.map((row) => (
        <div key={row[0].dateKey} className="classroom-month-schedule__row" role="row">
          {row.map((cell) => (
            <MonthCell
              key={cell.dateKey}
              cell={cell}
              selected={cell.dateKey === selectedDateKey}
              onSelectDate={onSelectDate}
              onOpenContest={onOpenContest}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function WeekScheduleGrid({
  cells,
  selectedDateKey,
  rangeLabel,
  locale,
  onSelectDate,
  onOpenContest,
}: {
  cells: ClassroomMonthScheduleCell[];
  selectedDateKey: string;
  rangeLabel: string;
  locale: string;
  onSelectDate: (dateKey: string) => void;
  onOpenContest: (contestId: string) => void;
}) {
  const { startHour, endHour } = getWeekHourRange(cells);
  const hours = Array.from(
    { length: Math.max(endHour - startHour + 1, 2) },
    (_, index) => startHour + index,
  );
  const slotRowsStyle = {
    gridTemplateRows: `repeat(${hours.length - 1}, minmax(0, 1fr))`,
  };

  return (
    <div
      className="classroom-week-schedule"
      role="grid"
      aria-label={rangeLabel}
      style={{ "--slot-count": hours.length - 1 } as CSSProperties}
    >
      <div className="classroom-week-schedule__header-row" role="row" style={{ display: "contents" }}>
        <div className="classroom-week-schedule__corner" role="columnheader" />
        {cells.map((cell) => (
          <button
            key={cell.dateKey}
            type="button"
            role="columnheader"
            className={[
              "classroom-week-schedule__day-heading",
              cell.dateKey === selectedDateKey
                ? "classroom-week-schedule__day-heading--selected"
                : "",
              cell.isToday ? "classroom-week-schedule__day-heading--today" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => onSelectDate(cell.dateKey)}
          >
            <span>{formatWeekdayDate(cell.date, locale)}</span>
          </button>
        ))}
      </div>

      <div className="classroom-week-schedule__body-row" role="row" style={{ display: "contents" }}>
        <div className="classroom-week-schedule__time-axis" role="gridcell" style={slotRowsStyle}>
          {hours.slice(0, -1).map((hour) => (
            <span key={hour}>{formatHourLabel(hour, locale)}</span>
          ))}
        </div>

        {cells.map((cell) => (
          <div
            key={cell.dateKey}
            className={[
              "classroom-week-schedule__day-column",
              cell.events.length === 0
                ? "classroom-week-schedule__day-column--empty"
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
            role="gridcell"
            aria-selected={cell.dateKey === selectedDateKey}
          >
          <button
            type="button"
            className="classroom-week-schedule__mobile-day-heading"
            onClick={() => onSelectDate(cell.dateKey)}
          >
            {formatWeekdayDate(cell.date, locale)}
          </button>
          <div
            className="classroom-week-schedule__hour-lines"
            aria-hidden="true"
            style={slotRowsStyle}
          >
            {hours.slice(0, -1).map((hour) => (
              <span key={hour} />
            ))}
          </div>

          {cell.events.map((event) => (
            <button
              key={event.contest.contestId}
              type="button"
              className="classroom-week-schedule__event"
              style={getWeekEventStyle(event, cell.date, startHour, endHour)}
              onClick={() => onOpenContest(event.contest.contestId)}
            >
              <span className="classroom-week-schedule__event-content">
                <span className="classroom-week-schedule__event-title">
                  {event.contest.contestName}
                </span>
                <span className="classroom-week-schedule__event-time">
                  {formatEventTime(new Date(event.sortMs), locale)}
                </span>
              </span>
            </button>
          ))}
        </div>
      ))}
      </div>
    </div>
  );
}

function MonthCell({
  cell,
  selected,
  onSelectDate,
  onOpenContest,
}: {
  cell: ClassroomMonthScheduleCell;
  selected: boolean;
  onSelectDate: (dateKey: string) => void;
  onOpenContest: (contestId: string) => void;
}) {
  const { t } = useTranslation("classroom");
  const visibleEvents = cell.events.slice(0, MAX_EVENTS_PER_DAY);
  const hiddenCount = cell.events.length - visibleEvents.length;
  const className = [
    "classroom-month-schedule__cell",
    cell.isToday ? "classroom-month-schedule__cell--today" : "",
    cell.isCurrentMonth ? "" : "classroom-month-schedule__cell--outside",
    selected ? "classroom-month-schedule__cell--selected" : "",
    cell.events.length > 0 ? "classroom-month-schedule__cell--has-events" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      <DateBadge cell={cell} onSelectDate={onSelectDate} />
      <span className="classroom-month-schedule__events">
        {visibleEvents.map((event) => (
          <button
            key={event.contest.contestId}
            type="button"
            className="classroom-month-schedule__event-pill"
            onClick={() => onOpenContest(event.contest.contestId)}
          >
            {event.contest.contestName}
          </button>
        ))}
        {hiddenCount > 0 ? (
          <span className="classroom-month-schedule__more">
            {t("activitySchedule.moreEvents", "+{{count}}", {
              count: hiddenCount,
            })}
          </span>
        ) : null}
      </span>
    </>
  );

  return (
    <div className={className} role="gridcell" aria-selected={selected}>
      {content}
    </div>
  );
}

function DateBadge({
  cell,
  onSelectDate,
}: {
  cell: ClassroomMonthScheduleCell;
  onSelectDate: (dateKey: string) => void;
}) {
  const { t } = useTranslation("classroom");
  const content = (
    <>
      {cell.date.getDate()}
      {cell.isToday ? (
        <span className="classroom-month-schedule__today-label">
          {t("activitySchedule.today", "今天")}
        </span>
      ) : null}
    </>
  );

  return (
    <button
      type="button"
      className="classroom-month-schedule__date-number classroom-month-schedule__date-number--button"
      onClick={() => onSelectDate(cell.dateKey)}
    >
      {content}
    </button>
  );
}
