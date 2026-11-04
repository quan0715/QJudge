import { useEffect, useRef } from "react";

import type { ContestDetail } from "@/core/entities/contest.entity";
import { useContestAdmin } from "@/features/contest/contexts";
import { isContestInExamWindow } from "@/features/contest/domain/examWindow";

/** The single owner of roster polling for the contest admin dashboard. */
export const useAdminParticipantsPolling = (
  contest: Pick<ContestDetail, "startTime" | "endTime"> | null | undefined,
  intervalMs = 10000,
) => {
  const { refreshParticipants } = useContestAdmin();
  const inFlightRef = useRef(false);
  const startTime = contest?.startTime;
  const endTime = contest?.endTime;

  useEffect(() => {
    const examWindow = { startTime: startTime ?? "", endTime: endTime ?? "" };
    const tick = async () => {
      if (document.visibilityState !== "visible" || inFlightRef.current) return;
      if (!isContestInExamWindow(examWindow, Date.now())) return;
      inFlightRef.current = true;
      try {
        await refreshParticipants();
      } finally {
        inFlightRef.current = false;
      }
    };
    const intervalId = window.setInterval(() => void tick(), intervalMs);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [endTime, intervalMs, refreshParticipants, startTime]);
};
