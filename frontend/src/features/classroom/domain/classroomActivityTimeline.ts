import {
  getBoundContestTimeRange,
  type BoundContest,
} from "@/core/entities/classroom.entity";

export { getBoundContestTimeRange } from "@/core/entities/classroom.entity";

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

// ── Time helpers ──────────────────────────────────────────────────────────────

export function localDateKeyFromMs(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
