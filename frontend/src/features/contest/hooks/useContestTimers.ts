import { useCallback, useEffect, useRef, useState } from "react";
import type { ContestDetail } from "@/core/entities/contest.entity";
import { useInterval } from "@/shared/hooks/useInterval";

interface UseContestTimersParams {
  contest: ContestDetail | null;
  contestId?: string;
  refreshContest?: () => Promise<void> | void;
  /** Disable main contest countdown computation (e.g., non-layout consumers) */
  enableMainCountdown?: boolean;
  /** Optional override for autoUnlockAt when contest data is unavailable */
  autoUnlockAt?: string | null;
  /** Optional override for exam status (for non-contest consumers) */
  examStatus?: string | null;
}

const DEFAULT_TIME = "00:00:00";

const formatTime = (diffMs: number) => {
  const totalSeconds = Math.max(0, Math.floor(diffMs / 1000));
  const hours = Math.floor(totalSeconds / 3600)
    .toString()
    .padStart(2, "0");
  const minutes = Math.floor((totalSeconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");

  return `${hours}:${minutes}:${seconds}`;
};

export const useContestTimers = ({
  contest,
  contestId,
  refreshContest,
  enableMainCountdown = true,
  autoUnlockAt,
  examStatus,
}: UseContestTimersParams) => {
  const [timeLeft, setTimeLeft] = useState(DEFAULT_TIME);
  const [isCountdownToStart, setIsCountdownToStart] = useState(false);
  const [unlockTimeLeft, setUnlockTimeLeft] = useState<string | null>(null);
  const hasRefreshedForTimerExpiration = useRef(false);
  const hasRefreshedForUnlock = useRef(false);

  const updateContestCountdown = useCallback(() => {
    if (!enableMainCountdown || !contest?.startTime || !contest?.endTime) {
      setTimeLeft(DEFAULT_TIME);
      setIsCountdownToStart(false);
      return;
    }

    const now = Date.now();
    const start = new Date(contest.startTime).getTime();
    const end = new Date(contest.endTime).getTime();
    const contestNotStartedYet = now < start;
    setIsCountdownToStart(contestNotStartedYet);

    const targetTime = contestNotStartedYet ? start : end;
    const diff = targetTime - now;

    if (diff <= 0) {
      setTimeLeft(DEFAULT_TIME);
      if (!hasRefreshedForTimerExpiration.current) {
        hasRefreshedForTimerExpiration.current = true;
        if (refreshContest) {
          void refreshContest();
        }
      }
      return;
    }

    setTimeLeft(formatTime(diff));
  }, [contest, enableMainCountdown, refreshContest]);

  const updateUnlockCountdown = useCallback(() => {
    const effectiveStatus = examStatus ?? contest?.examStatus;
    const effectiveAutoUnlockAt =
      autoUnlockAt !== undefined ? autoUnlockAt : contest?.autoUnlockAt;

    if (
      !effectiveStatus ||
      effectiveStatus !== "locked" ||
      !effectiveAutoUnlockAt
    ) {
      setUnlockTimeLeft(null);
      hasRefreshedForUnlock.current = false;
      return;
    }

    const now = Date.now();
    const unlockTime = new Date(effectiveAutoUnlockAt).getTime();
    const diff = unlockTime - now;

    if (diff <= 0) {
      setUnlockTimeLeft(DEFAULT_TIME);
      if (!hasRefreshedForUnlock.current) {
        hasRefreshedForUnlock.current = true;
        if (refreshContest) {
          void refreshContest();
        }
      }
      return;
    }

    setUnlockTimeLeft(formatTime(diff));
  }, [autoUnlockAt, contest, examStatus, refreshContest]);

  useEffect(() => {
    hasRefreshedForTimerExpiration.current = false;
    hasRefreshedForUnlock.current = false;
  }, [contestId]);

  useEffect(() => {
    updateContestCountdown();
  }, [updateContestCountdown]);

  useEffect(() => {
    updateUnlockCountdown();
  }, [updateUnlockCountdown]);

  useInterval(() => {
    updateContestCountdown();
  }, contest && enableMainCountdown ? 1000 : null);

  useInterval(() => {
    updateUnlockCountdown();
  }, contest?.examStatus === "locked" && contest?.autoUnlockAt ? 1000 : null);

  return {
    timeLeft,
    isCountdownToStart,
    unlockTimeLeft,
  };
};
