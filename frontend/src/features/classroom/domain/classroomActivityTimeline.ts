import type { BoundContest, ClassroomAnnouncement } from "@/core/entities/classroom.entity";

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
  | { type: "announcement"; announcement: ClassroomAnnouncement; sortMs: number };

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
    addEvent(localDateKeyFromMs(startMs), { type: "contest", contest: c, sortMs: startMs });
  }

  for (const a of announcements) {
    const sortMs = new Date(a.createdAt).getTime();
    if (Number.isNaN(sortMs)) continue;
    addEvent(localDateKeyFromMs(sortMs), { type: "announcement", announcement: a, sortMs });
  }

  const groups: TimelineDayGroup[] = Array.from(byDay.entries()).map(([dateKey, events]) => ({
    dateKey,
    isToday: dateKey === todayKey,
    events: [...events].sort((a, b) => a.sortMs - b.sortMs),
  }));

  groups.sort((a, b) => {
    const aMin = Math.min(...a.events.map((e) => e.sortMs));
    const bMin = Math.min(...b.events.map((e) => e.sortMs));
    return aMin - bMin;
  });

  return groups;
}

// ── Legacy exports (kept for backward compat, @deprecated) ───────────────────

/** @deprecated Use buildAllTimelineDayGroups instead */
export function contestBelongsOnActiveTimeline(contest: BoundContest, nowMs: number): boolean {
  const { startMs, endMs } = getBoundContestTimeRange(contest);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return false;
  if (nowMs >= endMs) return false;
  return startMs > nowMs || (nowMs >= startMs && nowMs < endMs);
}

/** @deprecated Use buildAllTimelineDayGroups instead */
export function pickHeroContest(contests: BoundContest[], nowMs: number): BoundContest | null {
  const active = contests.filter((c) => contestBelongsOnActiveTimeline(c, nowMs));
  if (active.length === 0) return null;
  const future = active.filter((c) => getBoundContestTimeRange(c).startMs > nowMs);
  const pool = future.length > 0 ? future : active;
  return pool.reduce((best, c) => {
    const t = getBoundContestTimeRange(c).startMs;
    const bt = getBoundContestTimeRange(best).startMs;
    return t < bt ? c : best;
  });
}

/** @deprecated Use buildAllTimelineDayGroups instead */
export function buildTimelineDayGroups(contests: BoundContest[], nowMs: number): { dateKey: string; contests: BoundContest[] }[] {
  const active = contests.filter((c) => contestBelongsOnActiveTimeline(c, nowMs));
  const byDay = new Map<string, BoundContest[]>();
  for (const c of active) {
    const { startMs } = getBoundContestTimeRange(c);
    const key = localDateKeyFromMs(startMs);
    const list = byDay.get(key) ?? [];
    list.push(c);
    byDay.set(key, list);
  }
  const groups = Array.from(byDay.entries()).map(([dateKey, list]) => ({
    dateKey,
    contests: [...list].sort((a, b) => getBoundContestTimeRange(a).startMs - getBoundContestTimeRange(b).startMs),
  }));
  groups.sort((a, b) => {
    const aMin = getBoundContestTimeRange(a.contests[0]).startMs;
    const bMin = getBoundContestTimeRange(b.contests[0]).startMs;
    return aMin - bMin;
  });
  return groups;
}
