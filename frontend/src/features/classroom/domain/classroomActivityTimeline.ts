import type {
  BoundContest,
  ClassroomAnnouncement,
} from "@/core/entities/classroom.entity";

// ── Calendar day row (consecutive, including empty days) ──────────────────────

export interface CalendarDayRow {
  dateKey: string;
  date: Date;
  isToday: boolean;
  events: TimelineEvent[];
}

// ── Month schedule (overview calendar) ───────────────────────────────────────

export interface ClassroomMonthScheduleEvent {
  type: "contest";
  contest: BoundContest;
  sortMs: number;
}

export interface ClassroomMonthScheduleCell {
  dateKey: string;
  date: Date;
  isToday: boolean;
  isCurrentMonth: boolean;
  events: ClassroomMonthScheduleEvent[];
}

function buildEventsByDay(
  contests: BoundContest[],
): Map<string, ClassroomMonthScheduleEvent[]> {
  const eventsByDay = new Map<string, ClassroomMonthScheduleEvent[]>();
  for (const contest of contests) {
    if (contest.contestStatus === "draft") continue;
    const { startMs } = getBoundContestTimeRange(contest);
    if (Number.isNaN(startMs)) continue;
    const key = localDateKeyFromMs(startMs);
    const list = eventsByDay.get(key) ?? [];
    list.push({ type: "contest", contest, sortMs: startMs });
    eventsByDay.set(key, list);
  }
  return eventsByDay;
}

/**
 * Builds a fixed six-week month grid for classroom overview.
 * Only contest/exam events are included; announcements are intentionally excluded.
 */
export function buildClassroomMonthSchedule(
  contests: BoundContest[],
  monthAnchor: Date,
  nowMs: number,
): ClassroomMonthScheduleCell[] {
  const todayKey = localDateKeyFromMs(nowMs);
  const monthStart = new Date(monthAnchor);
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const targetMonth = monthStart.getMonth();

  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - monthStart.getDay());

  const eventsByDay = buildEventsByDay(contests);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    const dateKey = localDateKeyFromMs(date.getTime());
    const events = eventsByDay.get(dateKey) ?? [];
    return {
      dateKey,
      date,
      isToday: dateKey === todayKey,
      isCurrentMonth: date.getMonth() === targetMonth,
      events: [...events].sort((a, b) => a.sortMs - b.sortMs),
    };
  });
}

export function buildClassroomWeekSchedule(
  contests: BoundContest[],
  weekAnchor: Date,
  nowMs: number,
): ClassroomMonthScheduleCell[] {
  const todayKey = localDateKeyFromMs(nowMs);
  const weekStart = new Date(weekAnchor);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const anchorMonth = weekAnchor.getMonth();

  const eventsByDay = buildEventsByDay(contests);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    const dateKey = localDateKeyFromMs(date.getTime());
    const events = eventsByDay.get(dateKey) ?? [];
    return {
      dateKey,
      date,
      isToday: dateKey === todayKey,
      isCurrentMonth: date.getMonth() === anchorMonth,
      events: [...events].sort((a, b) => a.sortMs - b.sortMs),
    };
  });
}

export function getUpcomingContestTasks(
  contests: BoundContest[],
  nowMs: number,
  limit = 3,
): BoundContest[] {
  return contests
    .filter((contest) => {
      if (contest.contestStatus !== "published") return false;
      const { endMs } = getBoundContestTimeRange(contest);
      return Number.isNaN(endMs) || endMs >= nowMs;
    })
    .sort(
      (a, b) =>
        getBoundContestTimeRange(a).startMs -
        getBoundContestTimeRange(b).startMs,
    )
    .slice(0, limit);
}

/**
 * Returns one entry per consecutive calendar day from startMs to endMs (inclusive).
 * Each entry contains all events (contests + announcements) that fall on that day.
 * Days with no events still appear (empty events array).
 */
export function buildCalendarDayRows(
  contests: BoundContest[],
  announcements: ClassroomAnnouncement[],
  startMs: number,
  endMs: number,
  nowMs: number,
): CalendarDayRow[] {
  const todayKey = localDateKeyFromMs(nowMs);

  // Build event map keyed by date string
  const eventsByDay = new Map<string, TimelineEvent[]>();

  function addEvent(key: string, event: TimelineEvent) {
    const list = eventsByDay.get(key) ?? [];
    list.push(event);
    eventsByDay.set(key, list);
  }

  for (const c of contests) {
    if (c.contestStatus === "draft") continue;
    const { startMs: cStart } = getBoundContestTimeRange(c);
    if (Number.isNaN(cStart)) continue;
    addEvent(localDateKeyFromMs(cStart), {
      type: "contest",
      contest: c,
      sortMs: cStart,
    });
  }

  for (const a of announcements) {
    const sortMs = new Date(a.createdAt).getTime();
    if (Number.isNaN(sortMs)) continue;
    addEvent(localDateKeyFromMs(sortMs), {
      type: "announcement",
      announcement: a,
      sortMs,
    });
  }

  // Normalise to start-of-local-day
  const startDate = new Date(startMs);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(endMs);
  endDate.setHours(23, 59, 59, 999);

  const rows: CalendarDayRow[] = [];
  const cursor = new Date(startDate);

  while (cursor <= endDate) {
    const key = localDateKeyFromMs(cursor.getTime());
    const rawEvents = eventsByDay.get(key) ?? [];
    rows.push({
      dateKey: key,
      date: new Date(cursor),
      isToday: key === todayKey,
      events: [...rawEvents].sort((a, b) => a.sortMs - b.sortMs),
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return rows;
}

// ── Time helpers ──────────────────────────────────────────────────────────────

export function getBoundContestTimeRange(contest: BoundContest): {
  startMs: number;
  endMs: number;
} {
  const startIso = contest.contestStartTime || contest.boundAt;
  const endIso = contest.contestEndTime || contest.boundAt;
  return {
    startMs: new Date(startIso).getTime(),
    endMs: new Date(endIso).getTime(),
  };
}

export function localDateKeyFromMs(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ── Timeline event union ──────────────────────────────────────────────────────

export type TimelineEvent =
  | { type: "contest"; contest: BoundContest; sortMs: number }
  | {
      type: "announcement";
      announcement: ClassroomAnnouncement;
      sortMs: number;
    };

// ── Day group ─────────────────────────────────────────────────────────────────

export interface TimelineDayGroup {
  dateKey: string;
  isToday: boolean;
  events: TimelineEvent[];
}

// ── All-time builder (contests + announcements, no date filter) ───────────────

export function buildAllTimelineDayGroups(
  contests: BoundContest[],
  announcements: ClassroomAnnouncement[],
  nowMs: number,
): TimelineDayGroup[] {
  const byDay = new Map<string, TimelineEvent[]>();
  const todayKey = localDateKeyFromMs(nowMs);

  function addEvent(key: string, event: TimelineEvent) {
    const list = byDay.get(key) ?? [];
    list.push(event);
    byDay.set(key, list);
  }

  for (const c of contests) {
    const { startMs } = getBoundContestTimeRange(c);
    if (Number.isNaN(startMs)) continue;
    addEvent(localDateKeyFromMs(startMs), {
      type: "contest",
      contest: c,
      sortMs: startMs,
    });
  }

  for (const a of announcements) {
    const sortMs = new Date(a.createdAt).getTime();
    if (Number.isNaN(sortMs)) continue;
    addEvent(localDateKeyFromMs(sortMs), {
      type: "announcement",
      announcement: a,
      sortMs,
    });
  }

  const groups: TimelineDayGroup[] = Array.from(byDay.entries()).map(
    ([dateKey, events]) => ({
      dateKey,
      isToday: dateKey === todayKey,
      events: [...events].sort((a, b) => a.sortMs - b.sortMs),
    }),
  );

  groups.sort((a, b) => {
    const aMin = Math.min(...a.events.map((e) => e.sortMs));
    const bMin = Math.min(...b.events.map((e) => e.sortMs));
    return aMin - bMin;
  });

  return groups;
}
