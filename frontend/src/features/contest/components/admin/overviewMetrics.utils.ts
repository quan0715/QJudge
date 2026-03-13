import type {
  ContestDetail,
  ContestOverviewExamStatus,
  ContestOverviewMetrics,
} from "@/core/entities/contest.entity";
import { getContestState } from "@/core/entities/contest.entity";

export interface ResolvedTimeProgress {
  totalSeconds: number;
  elapsedSeconds: number;
  remainingSeconds: number;
  progressPercent: number;
  isStarted: boolean;
  isEnded: boolean;
}

export interface ResolvedOverviewSnapshot {
  onlineNow: number;
  onlineActiveSessions: number;
  examStatus: ContestOverviewExamStatus;
  examType: ContestDetail["contestType"];
  timeProgress: ResolvedTimeProgress;
}

export const formatDuration = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

const toExamStatus = (state: string): ContestOverviewExamStatus => {
  if (state === "running") return "running";
  if (state === "ended" || state === "archived") return "ended";
  return "upcoming";
};

export const calculateContestTimeProgressAt = (
  contest: ContestDetail,
  nowMs: number,
): ResolvedTimeProgress => {
  const start = new Date(contest.startTime).getTime();
  const end = new Date(contest.endTime).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return {
      totalSeconds: 0,
      elapsedSeconds: 0,
      remainingSeconds: 0,
      progressPercent: 0,
      isStarted: false,
      isEnded: false,
    };
  }
  const totalSeconds = Math.max(0, Math.floor((end - start) / 1000));
  const elapsedSeconds = Math.min(
    Math.max(0, Math.floor((nowMs - start) / 1000)),
    totalSeconds,
  );
  const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);
  const progressPercent = totalSeconds > 0 ? (elapsedSeconds / totalSeconds) * 100 : 0;
  return {
    totalSeconds,
    elapsedSeconds,
    remainingSeconds,
    progressPercent,
    isStarted: nowMs >= start,
    isEnded: nowMs >= end,
  };
};

const fallbackTimeProgress = (contest: ContestDetail): ResolvedTimeProgress =>
  calculateContestTimeProgressAt(contest, Date.now());

export const resolveOverviewSnapshot = (
  contest: ContestDetail,
  overviewMetrics: ContestOverviewMetrics | null,
): ResolvedOverviewSnapshot => {
  const state = getContestState(contest);

  return {
    onlineNow: overviewMetrics?.onlineNow ?? 0,
    onlineActiveSessions: overviewMetrics?.onlineActiveSessions ?? 0,
    examStatus: overviewMetrics?.exam.status || toExamStatus(state),
    examType: overviewMetrics?.exam.contestType || contest.contestType,
    timeProgress: overviewMetrics?.timeProgress || fallbackTimeProgress(contest),
  };
};
