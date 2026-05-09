import { useCallback, useEffect, useRef, useState } from "react";
import type { ContestDetail } from "@/core/entities/contest.entity";
import { useInterval } from "@/shared/hooks/useInterval";

interface UseContestTimersParams {
  contest: ContestDetail | null;
  contestId?: string;
  refreshContest?: () => Promise<void> | void;
  /** Disable main contest countdown computation (e.g., non-layout consumers) */
  enableMainCountdown?: boolean;
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
}: UseContestTimersParams) => {
  const [timeLeft, setTimeLeft] = useState(DEFAULT_TIME);
  const [isCountdownToStart, setIsCountdownToStart] = useState(false);
  const hasRefreshedForTimerExpiration = useRef(false);

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

  useEffect(() => {
    hasRefreshedForTimerExpiration.current = false;
  }, [contestId]);

  useEffect(() => {
    const timerId = setTimeout(updateContestCountdown, 0);
    return () => clearTimeout(timerId);
  }, [updateContestCountdown]);

  useInterval(() => {
    updateContestCountdown();
  }, contest && enableMainCountdown ? 1000 : null);

  return {
    timeLeft,
    isCountdownToStart,
  };
};
