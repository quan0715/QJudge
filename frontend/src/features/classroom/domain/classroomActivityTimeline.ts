import type { BoundContest } from "@/core/entities/classroom.entity";

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

export function contestBelongsOnActiveTimeline(contest: BoundContest, nowMs: number): boolean {
  const { startMs, endMs } = getBoundContestTimeRange(contest);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return false;
  if (nowMs >= endMs) return false;
  const isFuture = startMs > nowMs;
  const isInProgress = nowMs >= startMs && nowMs < endMs;
  return isFuture || isInProgress;
}

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

export interface TimelineDayGroup {
  dateKey: string;
  contests: BoundContest[];
}

function localDateKeyFromMs(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function buildTimelineDayGroups(contests: BoundContest[], nowMs: number): TimelineDayGroup[] {
  const active = contests.filter((c) => contestBelongsOnActiveTimeline(c, nowMs));
  const byDay = new Map<string, BoundContest[]>();

  for (const c of active) {
    const { startMs } = getBoundContestTimeRange(c);
    const key = localDateKeyFromMs(startMs);
    const list = byDay.get(key) ?? [];
    list.push(c);
    byDay.set(key, list);
  }

  const groups: TimelineDayGroup[] = Array.from(byDay.entries()).map(([dateKey, list]) => ({
    dateKey,
    contests: [...list].sort(
      (a, b) => getBoundContestTimeRange(a).startMs - getBoundContestTimeRange(b).startMs,
    ),
  }));

  groups.sort((a, b) => {
    const aMin = getBoundContestTimeRange(a.contests[0]).startMs;
    const bMin = getBoundContestTimeRange(b.contests[0]).startMs;
    return aMin - bMin;
  });

  return groups;
}
