import { useState, useRef, useEffect, useCallback } from "react";
import type { ExamModeState, ExamStatusType } from "@/core/entities/contest.entity";
import { recordExamEvent } from "@/infrastructure/api/repositories";
import type { ExamEventResponse } from "@/infrastructure/api/repositories/exam.repository";
import { isFullscreen } from "@/core/usecases/exam";
import {
  buildAnticheatMetadata,
  decideAnticheatSignal,
  syncAnticheatPhaseWithExamStatus,
} from "@/features/contest/anticheat/orchestrator";
import { isRuntimeScreenShareReauthActive } from "@/features/contest/anticheat/runtimeReauthState";

export interface UseExamStateProps {
  contestId: string;
  examStatus?: ExamStatusType;
  lockReason?: string;
  isBypassed: boolean;
  onRefresh?: () => Promise<void>;
  requestFullscreen: () => Promise<unknown>;
}

const isMonitoredExamStatus = (status?: ExamStatusType) =>
  status === "in_progress" ||
  status === "paused" ||
  status === "locked" ||
  status === "locked_takeover";

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
    source?: string;
    severity?: "info" | "warning" | "violation";
  };
  type SkippedDispatchResult = { skipped: true };

  const isSkippedDispatchResult = (
    value: ExamEventResponse | SkippedDispatchResult | null
  ): value is SkippedDispatchResult => {
    return !!value && typeof value === "object" && "skipped" in value;
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
        submitted?: boolean;
        exam_status?: ExamStatusType;
        submit_reason?: string;
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

  const dispatchExamEvent = useCallback(
    async ({
      eventType,
      reason,
      source,
      severity,
    }: {
      eventType: string;
      reason: string;
      source: string;
      severity?: "info" | "warning" | "violation";
    }): Promise<ExamEventResponse | SkippedDispatchResult | null> => {
      const decision = decideAnticheatSignal(contestId, {
        eventType,
        reason,
        source,
        severity,
      });
      if (!decision.accepted) {
        return { skipped: true as const };
      }

      const response = await recordExamEvent(contestId, eventType, {
        reason,
        source,
        phase: decision.phase,
        eventIdempotencyKey: decision.eventIdempotencyKey,
        metadata: buildAnticheatMetadata(decision, {
          source,
          severity,
        }),
      });
      return response;
    },
    [contestId]
  );

  const handleWarningTimeout = useCallback(async () => {
    if (
      warningTimeoutProcessingRef.current ||
      isBypassed ||
      examStatus !== "in_progress"
    ) {
      return;
    }

    warningTimeoutProcessingRef.current = true;
    setPendingApiResponse(true);
    try {
      const response = await dispatchExamEvent({
        eventType: "warning_timeout",
        reason: WARNING_TIMEOUT_REASON,
        source: "warning_timeout",
        severity: "violation",
      });
      if (isSkippedDispatchResult(response)) {
        return;
      }
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
  }, [dispatchExamEvent, examStatus, isBypassed, onRefresh]);

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
    syncAnticheatPhaseWithExamStatus(contestId, examStatus);

    const effectiveIsLocked = examStatus === "locked" || examStatus === "locked_takeover";
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

    // Reset processing state only when transitioning FROM non-monitored TO monitored
    // (e.g., not_started → in_progress, or submitted → in_progress on re-entry).
    // Do NOT clear the queue when transitioning between monitored states
    // (e.g., in_progress → locked), as that would drop queued violations.
    const wasMonitored = isMonitoredExamStatus(prevExamStatusRef.current);
    const isNowMonitored = isMonitoredExamStatus(examStatus) && !isBypassed;
    if (isNowMonitored && !wasMonitored) {
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
  }, [contestId, examStatus, lockReason, isBypassed, stopWarningCountdown]);

  const drainViolationQueue = useCallback(async () => {
    if (isProcessingEventRef.current) return;
    if (isBypassed || !isMonitoredExamStatus(examStatus)) return;
    if (queuedViolationRef.current.length === 0) return;

    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    isProcessingEventRef.current = true;
    try {
      while (queuedViolationRef.current.length > 0) {
        if (isBypassed || !isMonitoredExamStatus(examStatus)) break;

        const currentViolation = queuedViolationRef.current[0];
        setPendingApiResponse(true);
        if (examStatus === "in_progress") {
          setWarningEventType(currentViolation.eventType);
          setShowWarning(true);
        }

        try {
          const response = await dispatchExamEvent({
            eventType: currentViolation.eventType,
            reason: currentViolation.reason,
            source: currentViolation.source || "detector:unknown",
            severity: currentViolation.severity || "warning",
          });
          if (isSkippedDispatchResult(response)) {
            queuedViolationRef.current.shift();
            continue;
          }

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
              isLocked:
                response.exam_status === "locked" || !!response.locked || prev.isLocked,
            }));
          }
          if (onRefresh) {
            void onRefresh().catch((refreshError) => {
              console.error("Failed to refresh exam state after violation:", refreshError);
            });
          }

          queuedViolationRef.current.shift();

          if (response.submitted || response.exam_status === "submitted") {
            stopWarningCountdown();
            setShowWarning(false);
            setWarningEventType(null);
            queuedViolationRef.current = [];
            break;
          }

          if (response.locked || response.exam_status === "locked") {
            stopWarningCountdown();
            queuedViolationRef.current = [];
            break;
          }
          if (examStatus === "in_progress") {
            startWarningCountdown();
          }
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
        isMonitoredExamStatus(examStatus)
      ) {
        retryTimerRef.current = setTimeout(() => {
          void drainViolationQueue();
        }, EVENT_RETRY_DELAY_MS);
      }
    }
  }, [dispatchExamEvent, examStatus, isBypassed, onRefresh, startWarningCountdown, stopWarningCountdown]);

  const handleViolation = useCallback(
    async (
      eventType: string,
      reason: string,
      options?: { source?: string; severity?: "info" | "warning" | "violation" }
    ) => {
      if (!isMonitoredExamStatus(examStatus) || isBypassed) {
        return;
      }
      if (isRuntimeScreenShareReauthActive()) {
        return;
      }
      queuedViolationRef.current.push({
        eventType,
        reason,
        source: options?.source || "detector:unknown",
        severity: options?.severity,
      });
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
