import { useState, useRef, useEffect, useCallback } from "react";
import type { ExamModeState, ExamStatusType } from "@/core/entities/contest.entity";
import type { ExamEventResponse } from "@/infrastructure/api/repositories/exam.repository";
import { isFullscreen } from "@/core/usecases/exam";
import {
  buildAnticheatMetadata,
  decideAnticheatSignal,
  syncAnticheatPhaseWithExamStatus,
} from "@/features/contest/anticheat/orchestrator";
import { recordExamEventWithForcedCapture } from "@/features/contest/anticheat/forcedCapture";
import type { ForcedCaptureModule } from "@/features/contest/anticheat/forcedCapture";
import { isRuntimeScreenShareReauthActive } from "@/features/contest/anticheat/runtimeReauthState";
import { getExamCaptureSessionId } from "@/shared/state/examCaptureSessionStore";

export interface UseExamStateProps {
  contestId: string;
  examStatus?: ExamStatusType;
  isExamMonitored?: boolean;
  lockReason?: string;
  isBypassed: boolean;
  onRefresh?: () => Promise<void>;
  requestFullscreen: () => Promise<unknown>;
  evidenceCaptureModules?: ForcedCaptureModule[];
}

type SkippedDispatchResult = { skipped: true };

const isSkippedDispatchResult = (
  value: ExamEventResponse | SkippedDispatchResult | null
): value is SkippedDispatchResult => {
  return !!value && typeof value === "object" && "skipped" in value;
};

/** Local fallback when backend flag hasn't propagated yet (e.g. from event API responses). */
const isMonitoredExamStatus = (status?: ExamStatusType) =>
  status === "in_progress" ||
  status === "paused" ||
  status === "locked";

export function useExamState({
  contestId,
  examStatus,
  isExamMonitored,
  lockReason,
  isBypassed,
  onRefresh,
  requestFullscreen,
  evidenceCaptureModules,
}: UseExamStateProps) {
  const EVENT_RETRY_DELAY_MS = 1500;

  type ViolationPayload = {
    eventType: string;
    reason: string;
    source?: string;
    severity?: "info" | "warning" | "violation";
  };

  const [examState, setExamState] = useState<ExamModeState>({
    isActive: false,
    isLocked: false,
    violationCount: 0,
    maxWarnings: 0,
  });

  const [lastApiResponse, setLastApiResponse] = useState<
    | {
        status?: string;
        message?: string;
        error?: boolean | string;
        locked?: boolean;
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

  const isProcessingEventRef = useRef(false);
  const queuedViolationRef = useRef<ViolationPayload[]>([]);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevExamStatusRef = useRef(examStatus);
  const evidenceCaptureModulesRef = useRef(evidenceCaptureModules);

  useEffect(() => {
    evidenceCaptureModulesRef.current = evidenceCaptureModules;
  }, [evidenceCaptureModules]);

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

      const response = await recordExamEventWithForcedCapture(contestId, eventType, {
        reason,
        source,
        phase: decision.phase,
        eventIdempotencyKey: decision.eventIdempotencyKey,
        forceCaptureReason: `${eventType}:${reason}`,
        captureOptions: {
          eventType,
          modules: evidenceCaptureModulesRef.current,
        },
        metadata: buildAnticheatMetadata(decision, {
          source,
          severity,
          upload_session_id: getExamCaptureSessionId(contestId) || undefined,
        }),
      });
      return response;
    },
    [contestId]
  );

  useEffect(() => {
    syncAnticheatPhaseWithExamStatus(contestId, examStatus);

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

    // Reset processing state only when transitioning FROM non-monitored TO monitored
    // (e.g., not_started → in_progress, or submitted → in_progress on re-entry).
    // Do NOT clear the queue when transitioning between monitored states
    // (e.g., in_progress → locked), as that would drop queued violations.
    const wasMonitored = isMonitoredExamStatus(prevExamStatusRef.current);
    const isNowMonitored = (isExamMonitored ?? isMonitoredExamStatus(examStatus)) && !isBypassed;
    if (isNowMonitored && !wasMonitored) {
      isProcessingEventRef.current = false;
      queuedViolationRef.current = [];
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    }

    prevExamStatusRef.current = examStatus;
  }, [contestId, examStatus, isExamMonitored, lockReason, isBypassed]);

  const drainViolationQueue = useCallback(async () => {
    if (isProcessingEventRef.current) return;
    if (isBypassed || !(isExamMonitored ?? isMonitoredExamStatus(examStatus))) return;
    if (queuedViolationRef.current.length === 0) return;

    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    isProcessingEventRef.current = true;
    try {
      while (queuedViolationRef.current.length > 0) {
        if (isBypassed || !(isExamMonitored ?? isMonitoredExamStatus(examStatus))) break;

        const currentViolation = queuedViolationRef.current[0];

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

          if (response.exam_status === "submitted") {
            queuedViolationRef.current = [];
            break;
          }

          if (response.locked || response.exam_status === "locked") {
            queuedViolationRef.current = [];
            break;
          }
        } catch (error) {
          console.error("Failed to record event:", error);
          setLastApiResponse({
            error: true,
            message: error instanceof Error ? error.message : "Failed to record event",
          });
          break;
        }
      }
    } finally {
      isProcessingEventRef.current = false;
      if (
        queuedViolationRef.current.length > 0 &&
        !isBypassed &&
        (isExamMonitored ?? isMonitoredExamStatus(examStatus))
      ) {
        retryTimerRef.current = setTimeout(() => {
          void drainViolationQueue();
        }, EVENT_RETRY_DELAY_MS);
      }
    }
  }, [dispatchExamEvent, examStatus, isExamMonitored, isBypassed, onRefresh]);

  const handleViolation = useCallback(
    async (
      eventType: string,
      reason: string,
      options?: { source?: string; severity?: "info" | "warning" | "violation" }
    ) => {
      if (!(isExamMonitored ?? isMonitoredExamStatus(examStatus)) || isBypassed) {
        return;
      }
      if (isRuntimeScreenShareReauthActive(contestId)) {
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
    [contestId, drainViolationQueue, examStatus, isExamMonitored, isBypassed]
  );

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
    };
  }, []);

  return {
    examState,
    lastApiResponse,
    showUnlockNotification,
    isProcessingEventRef,
    handleViolation,
    handleUnlockContinue,
  };
}
