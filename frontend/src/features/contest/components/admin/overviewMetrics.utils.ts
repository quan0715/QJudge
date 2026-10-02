import type { ContestDetail } from "@/core/entities/contest.entity";

export interface ResolvedTimeProgress {
  totalSeconds: number;
  elapsedSeconds: number;
  remainingSeconds: number;
  progressPercent: number;
  isStarted: boolean;
  isEnded: boolean;
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
