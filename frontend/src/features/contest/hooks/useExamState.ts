import { useState, useRef, useEffect, useCallback } from "react";
import type { ExamModeState, ExamStatusType } from "@/core/entities/contest.entity";
import { recordExamEvent } from "@/infrastructure/api/repositories";
import { isFullscreen } from "@/core/usecases/exam";

export interface UseExamStateProps {
  contestId: string;
  examStatus?: ExamStatusType;
  lockReason?: string;
  isBypassed: boolean;
  onRefresh?: () => Promise<void>;
  requestFullscreen: () => Promise<unknown>;
}

export function useExamState({
  contestId,
  examStatus,
  lockReason,
  isBypassed,
  onRefresh,
  requestFullscreen,
}: UseExamStateProps) {
  const EVENT_RETRY_DELAY_MS = 1500;
  const WARNING_TIMEOUT_SECONDS = 30;
  const WARNING_TIMEOUT_REASON =
    "Warning timeout: student did not acknowledge warning within 30 seconds";

  type ViolationPayload = {
    eventType: string;
    reason: string;
  };

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
  const [warningCountdown, setWarningCountdown] = useState<number | null>(null);

  const isProcessingEventRef = useRef(false);
  const queuedViolationRef = useRef<ViolationPayload[]>([]);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningCountdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const warningTimeoutProcessingRef = useRef(false);
  const prevExamStatusRef = useRef(examStatus);

  const stopWarningCountdown = useCallback(() => {
    if (warningCountdownTimerRef.current) {
      clearInterval(warningCountdownTimerRef.current);
      warningCountdownTimerRef.current = null;
    }
    setWarningCountdown(null);
  }, []);

  const handleWarningTimeout = useCallback(async () => {
    if (warningTimeoutProcessingRef.current || isBypassed || examStatus === "locked") {
      return;
    }

    warningTimeoutProcessingRef.current = true;
    setPendingApiResponse(true);
    try {
      const response = await recordExamEvent(
        contestId,
        "warning_timeout",
        WARNING_TIMEOUT_REASON
      );
      if (!response || typeof response !== "object") {
        throw new Error("Failed to record warning timeout event");
      }

      setLastApiResponse(response);
      if (!response.bypass) {
        setExamState((prev) => ({
          ...prev,
          violationCount: response.violation_count ?? prev.violationCount,
          maxWarnings: response.max_cheat_warnings ?? prev.maxWarnings,
          autoUnlockAt: response.auto_unlock_at,
          isLocked: !!response.locked || prev.isLocked,
          lockReason: response.locked ? WARNING_TIMEOUT_REASON : prev.lockReason,
        }));
      }
      if (onRefresh) {
        void onRefresh().catch((refreshError) => {
          console.error("Failed to refresh exam state after warning timeout:", refreshError);
        });
      }
      queuedViolationRef.current = [];
    } catch (error) {
      console.error("Failed to record warning timeout:", error);
      setLastApiResponse({
        error: true,
        message:
          error instanceof Error
            ? error.message
            : "Failed to record warning timeout event",
      });
    } finally {
      setPendingApiResponse(false);
      warningTimeoutProcessingRef.current = false;
    }
  }, [contestId, examStatus, isBypassed, onRefresh]);

  const startWarningCountdown = useCallback(() => {
    stopWarningCountdown();
    setWarningCountdown(WARNING_TIMEOUT_SECONDS);
    warningCountdownTimerRef.current = setInterval(() => {
      setWarningCountdown((prev) => {
        if (prev == null) return null;
        if (prev <= 1) {
          if (warningCountdownTimerRef.current) {
            clearInterval(warningCountdownTimerRef.current);
            warningCountdownTimerRef.current = null;
          }
          void handleWarningTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [handleWarningTimeout, stopWarningCountdown]);

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
      queuedViolationRef.current = [];
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      warningTimeoutProcessingRef.current = false;
      stopWarningCountdown();
    }

    prevExamStatusRef.current = examStatus;
  }, [examStatus, lockReason, isBypassed, stopWarningCountdown]);

  const drainViolationQueue = useCallback(async () => {
    if (isProcessingEventRef.current) return;
    if (isBypassed || examStatus === "locked") return;
    if (queuedViolationRef.current.length === 0) return;

    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    isProcessingEventRef.current = true;
    try {
      while (queuedViolationRef.current.length > 0) {
        if (isBypassed || (examStatus as string) === "locked") break;

        const currentViolation = queuedViolationRef.current[0];
        setPendingApiResponse(true);
        setWarningEventType(currentViolation.eventType);
        setShowWarning(true);

        try {
          const response = await recordExamEvent(
            contestId,
            currentViolation.eventType,
            currentViolation.reason
          );

          if (!response || typeof response !== "object") {
            throw new Error("Failed to record exam event");
          }

          setLastApiResponse(response);
          if (!response.bypass) {
            setExamState((prev) => ({
              ...prev,
              violationCount: response.violation_count ?? prev.violationCount,
              maxWarnings: response.max_cheat_warnings ?? prev.maxWarnings,
              autoUnlockAt: response.auto_unlock_at,
              isLocked: !!response.locked || prev.isLocked,
            }));
          }
          if (onRefresh) {
            void onRefresh().catch((refreshError) => {
              console.error("Failed to refresh exam state after violation:", refreshError);
            });
          }

          queuedViolationRef.current.shift();

          if (response.locked) {
            stopWarningCountdown();
            queuedViolationRef.current = [];
            break;
          }
          startWarningCountdown();
        } catch (error) {
          console.error("Failed to record event:", error);
          setLastApiResponse({
            error: true,
            message: error instanceof Error ? error.message : "Failed to record event",
          });
          break;
        } finally {
          setPendingApiResponse(false);
        }
      }
    } finally {
      isProcessingEventRef.current = false;
      if (
        queuedViolationRef.current.length > 0 &&
        !isBypassed &&
        (examStatus as string) !== "locked"
      ) {
        retryTimerRef.current = setTimeout(() => {
          void drainViolationQueue();
        }, EVENT_RETRY_DELAY_MS);
      }
    }
  }, [contestId, examStatus, isBypassed, onRefresh, startWarningCountdown, stopWarningCountdown]);

  const handleViolation = useCallback(
    async (eventType: string, reason: string) => {
      if (examStatus === "locked" || isBypassed) {
        return;
      }
      queuedViolationRef.current.push({ eventType, reason });
      if (!isProcessingEventRef.current) {
        await drainViolationQueue();
      }
    },
    [drainViolationQueue, examStatus, isBypassed]
  );

  const handleWarningClose = useCallback(async () => {
    if (pendingApiResponse) return;

    setShowWarning(false);
    stopWarningCountdown();

    if (lastApiResponse?.locked) {
      if (!isFullscreen()) {
        try {
          await requestFullscreen();
        } catch (error) {
          console.error("Failed to re-enter fullscreen:", error);
        }
      }
      if (onRefresh) onRefresh();
    } else {
      if (!isFullscreen()) {
        try {
          await requestFullscreen();
        } catch (error) {
          console.error("Failed to re-enter fullscreen:", error);
        }
      }
    }

    setWarningEventType(null);
    setLastApiResponse(null);

    if (
      !lastApiResponse?.locked &&
      queuedViolationRef.current.length > 0 &&
      !isProcessingEventRef.current
    ) {
      void drainViolationQueue();
    }
  }, [drainViolationQueue, pendingApiResponse, lastApiResponse, onRefresh, requestFullscreen, stopWarningCountdown]);

  const handleUnlockContinue = useCallback(async () => {
    setShowUnlockNotification(false);
    if (!isFullscreen()) {
      try {
        await requestFullscreen();
      } catch (error) {
        console.error("Failed to re-enter fullscreen:", error);
      }
    }
  }, [requestFullscreen]);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (warningCountdownTimerRef.current) {
        clearInterval(warningCountdownTimerRef.current);
        warningCountdownTimerRef.current = null;
      }
    };
  }, []);

  return {
    examState,
    showWarning,
    warningEventType,
    pendingApiResponse,
    lastApiResponse,
    warningCountdown,
    showUnlockNotification,
    isProcessingEventRef,
    handleViolation,
    handleWarningClose,
    handleUnlockContinue,
  };
}
