import { useCallback, useEffect, useRef, useState } from "react";
import type { ExamModeState, ExamStatusType } from "@/core/entities/contest.entity";
import { isFullscreen } from "@/infrastructure/browser/fullscreen";
import { syncAnticheatPhaseWithExamStatus } from "@/features/contest/anticheat/orchestrator";

export interface UseExamStateProps {
  contestId: string;
  examStatus?: ExamStatusType;
  isExamMonitored?: boolean;
  lockReason?: string;
  isBypassed: boolean;
  requestFullscreen: () => Promise<unknown>;
}

/** Reflects server-projected exam state only; it never applies local penalties. */
export function useExamState({
  contestId,
  examStatus,
  isExamMonitored,
  lockReason,
  isBypassed,
  requestFullscreen,
}: UseExamStateProps) {
  const [examState, setExamState] = useState<ExamModeState>({
    isActive: false,
    isLocked: false,
    violationCount: 0,
  });
  const [showUnlockNotification, setShowUnlockNotification] = useState(false);
  const previousStatusRef = useRef(examStatus);

  useEffect(() => {
    syncAnticheatPhaseWithExamStatus(contestId, examStatus);
    const wasLocked = previousStatusRef.current === "locked";
    setExamState({
      isActive: examStatus === "in_progress" && !!isExamMonitored && !isBypassed,
      isLocked: examStatus === "locked",
      lockReason,
      violationCount: 0,
    });
    if (wasLocked && examStatus === "paused") setShowUnlockNotification(true);
    previousStatusRef.current = examStatus;
  }, [contestId, examStatus, isBypassed, isExamMonitored, lockReason]);

  const handleUnlockContinue = useCallback(async () => {
    setShowUnlockNotification(false);
    if (!isFullscreen()) await requestFullscreen().catch(() => undefined);
  }, [requestFullscreen]);

  return { examState, showUnlockNotification, handleUnlockContinue };
}
