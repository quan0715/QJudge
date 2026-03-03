import { useState, useRef, useEffect, useCallback } from "react";
import type { ExamModeState, ExamStatusType } from "@/core/entities/contest.entity";
import { recordExamEvent } from "@/infrastructure/api/repositories";

export interface UseExamStateProps {
  contestId: string;
  examStatus?: ExamStatusType;
  lockReason?: string;
  isBypassed: boolean;
  onRefresh?: () => Promise<void>;
  requestFullscreen: () => Promise<void>;
}

export function useExamState({
  contestId,
  examStatus,
  lockReason,
  isBypassed,
  onRefresh,
  requestFullscreen,
}: UseExamStateProps) {
  const [examState, setExamState] = useState<ExamModeState>({
    isActive: false,
    isLocked: false,
    violationCount: 0,
    maxWarnings: 0,
  });

  const [showWarning, setShowWarning] = useState(false);
  const [warningEventType, setWarningEventType] = useState<string | null>(null);
  const [pendingApiResponse, setPendingApiResponse] = useState(false);
  const [lastApiResponse, setLastApiResponse] = useState<
    | {
        status?: string;
        message?: string;
        error?: boolean | string;
        locked?: boolean;
        violation_count?: number;
        max_cheat_warnings?: number;
        auto_unlock_at?: string;
        bypass?: boolean;
      }
    | null
  >(null);
  const [showUnlockNotification, setShowUnlockNotification] = useState(false);

  const isProcessingEventRef = useRef(false);
  const prevExamStatusRef = useRef(examStatus);

  useEffect(() => {
    const effectiveIsLocked = examStatus === "locked";
    const effectiveIsActive = examStatus === "in_progress";

    setExamState((prev) => ({
      ...prev,
      isActive: effectiveIsActive,
      isLocked: effectiveIsLocked,
      lockReason: lockReason || prev.lockReason,
    }));

    if (prevExamStatusRef.current === "locked" && examStatus === "paused") {
      setShowUnlockNotification(true);
    }

    // Reset processing state when monitoring becomes active
    if (effectiveIsActive && !isBypassed) {
      isProcessingEventRef.current = false;
    }

    prevExamStatusRef.current = examStatus;
  }, [examStatus, lockReason, isBypassed]);

  const handleViolation = useCallback(
    async (eventType: string, reason: string) => {
      const isCurrentlyLocked = examStatus === "locked";

      if (isProcessingEventRef.current || isCurrentlyLocked || isBypassed) {
        return;
      }

      isProcessingEventRef.current = true;
      setPendingApiResponse(true);
      setWarningEventType(eventType);
      setShowWarning(true);

      try {
        const response = await recordExamEvent(contestId, eventType, reason);
        setLastApiResponse(response);

        if (response && typeof response === "object") {
          if (!response.bypass) {
            setExamState((prev) => ({
              ...prev,
              violationCount: response.violation_count ?? prev.violationCount,
              maxWarnings: response.max_cheat_warnings ?? prev.maxWarnings,
              autoUnlockAt: response.auto_unlock_at,
            }));
          }
        }
      } catch (error) {
        console.error("Failed to record event:", error);
        setLastApiResponse({ error: true });
      }

      setPendingApiResponse(false);
    },
    [contestId, examStatus, isBypassed]
  );

  const handleWarningClose = useCallback(async () => {
    if (pendingApiResponse) return;

    setShowWarning(false);

    if (lastApiResponse?.locked) {
      if (!document.fullscreenElement) {
        try {
          await requestFullscreen();
        } catch (error) {
          console.error("Failed to re-enter fullscreen:", error);
        }
      }
      if (onRefresh) onRefresh();
    } else {
      isProcessingEventRef.current = false;
      if (!document.fullscreenElement) {
        try {
          await requestFullscreen();
        } catch (error) {
          console.error("Failed to re-enter fullscreen:", error);
        }
      }
    }

    setWarningEventType(null);
    setLastApiResponse(null);
  }, [pendingApiResponse, lastApiResponse, onRefresh, requestFullscreen]);

  const handleUnlockContinue = useCallback(async () => {
    setShowUnlockNotification(false);
    if (!document.fullscreenElement) {
      try {
        await requestFullscreen();
      } catch (error) {
        console.error("Failed to re-enter fullscreen:", error);
      }
    }
  }, [requestFullscreen]);

  return {
    examState,
    showWarning,
    warningEventType,
    pendingApiResponse,
    lastApiResponse,
    showUnlockNotification,
    isProcessingEventRef,
    handleViolation,
    handleWarningClose,
    handleUnlockContinue,
  };
}
