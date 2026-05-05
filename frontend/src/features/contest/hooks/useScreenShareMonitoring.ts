/**
 * useScreenShareMonitoring
 *
 * Screen-share stream monitoring with runtimeReauthState-driven countdown.
 * Uses useViolationPipeline with externalCountdown=true — the pipeline only
 * records triggered/restored events and manages isInterrupted state.
 * Countdown and timeout-triggered force submit remain driven by runtimeReauthState.
 */
import { useCallback, useEffect, useRef } from "react";
import { getTimingConfig } from "@/features/contest/domain/examMonitoringPolicy";
import { VIOLATION_ROUTES_MAP } from "@/features/contest/domain/violationRoutes";
import {
  beginRuntimeScreenShareReauth,
  endRuntimeScreenShareReauth,
  clearRuntimeScreenShareReauth,
  useRuntimeScreenShareReauth,
} from "@/features/contest/anticheat/runtimeReauthState";
import { recordExamEventWithForcedCapture } from "@/features/contest/anticheat/forcedCapture";
import type { ForcedCaptureModule } from "@/features/contest/anticheat/forcedCapture";
import { getExamCaptureSessionId } from "@/shared/state/examCaptureSessionStore";
import { useViolationPipeline } from "./useViolationPipeline";
import type { ForceSubmitRequest } from "./useForceSubmitArbiter";
import type { ExamEventResponse } from "@/infrastructure/api/repositories/exam.repository";

export interface UseScreenShareMonitoringConfig {
  contestId: string;
  enabled: boolean;
  examSubmitted: boolean;
  monitoringDisabled: boolean;
  moduleRole: string;
  recoveryGraceMs?: number;
  evidenceCaptureModules?: ForcedCaptureModule[];
  requestForceSubmit: (req: ForceSubmitRequest) => Promise<void>;
  onEnvironmentPaused?: (response: ExamEventResponse | null) => void;
}

export interface RuntimeReauthSnapshot {
  active: boolean;
  inProgress: boolean;
  remainingSeconds: number | null;
}

export interface UseScreenShareMonitoringReturn {
  onStreamLost: () => void;
  onStreamRestored: () => void;
  reauth: RuntimeReauthSnapshot;
}

const screenShareRoute = VIOLATION_ROUTES_MAP["screen_share"];

export function useScreenShareMonitoring({
  contestId,
  enabled,
  examSubmitted,
  monitoringDisabled,
  moduleRole,
  recoveryGraceMs,
  evidenceCaptureModules,
  requestForceSubmit,
  onEnvironmentPaused,
}: UseScreenShareMonitoringConfig): UseScreenShareMonitoringReturn {
  const runtimeReauth = useRuntimeScreenShareReauth(contestId);

  const hasTriggeredTimeoutRef = useRef(false);
  const isSubmittingRef = useRef(false);

  const contestIdRef = useRef(contestId);
  const moduleRoleRef = useRef(moduleRole);
  const recoveryGraceMsRef = useRef(recoveryGraceMs);
  const evidenceCaptureModulesRef = useRef(evidenceCaptureModules);
  const onEnvironmentPausedRef = useRef(onEnvironmentPaused);

  useEffect(() => {
    contestIdRef.current = contestId;
  }, [contestId]);
  useEffect(() => {
    moduleRoleRef.current = moduleRole;
  }, [moduleRole]);
  useEffect(() => {
    recoveryGraceMsRef.current = recoveryGraceMs;
  }, [recoveryGraceMs]);
  useEffect(() => {
    evidenceCaptureModulesRef.current = evidenceCaptureModules;
  }, [evidenceCaptureModules]);
  useEffect(() => {
    onEnvironmentPausedRef.current = onEnvironmentPaused;
  }, [onEnvironmentPaused]);

  const pipeline = useViolationPipeline({
    route: screenShareRoute,
    contestId,
    enabled,
    examSubmitted,
    recoveryGraceMs,
    moduleRole,
    externalCountdown: true,
    requestForceSubmit,
    // Suppress default runtimeReauth check — screen_share IS the reauth source
    isSuppressed: () => false,
    forceSubmitExtras: {
      sourceModule: "screen_share",
      evidenceCaptureModules,
    },
  });

  const onStreamLost = useCallback(() => {
    if (!enabled || examSubmitted) return;
    if (runtimeReauth.active) return;

    const recoveryMs = Math.max(
      1,
      recoveryGraceMsRef.current ??
        getTimingConfig().screenShareRecoveryGraceMs,
    );
    pipeline.trigger({ reason: "stream_ended" });
    beginRuntimeScreenShareReauth(contestIdRef.current, recoveryMs);
  }, [enabled, examSubmitted, runtimeReauth.active, pipeline]);

  const onStreamRestored = useCallback(() => {
    hasTriggeredTimeoutRef.current = false;
    pipeline.recover("user_reshared");
    endRuntimeScreenShareReauth(contestIdRef.current);
  }, [pipeline]);

  // Fire force submit when runtimeReauth countdown reaches zero
  useEffect(() => {
    if (!runtimeReauth.inProgress) {
      hasTriggeredTimeoutRef.current = false;
      return;
    }
    if (
      runtimeReauth.remainingSeconds === 0 &&
      !hasTriggeredTimeoutRef.current &&
      !isSubmittingRef.current
    ) {
      hasTriggeredTimeoutRef.current = true;
      isSubmittingRef.current = true;

      const cid = contestIdRef.current;
      const role = moduleRoleRef.current;

      void recordExamEventWithForcedCapture(cid, "screen_share_stopped", {
        reason: "Screen share recovery timeout",
        source: "exam_mode:screen_share_recovery_timeout",
        forceCaptureReason: "screen_share_stopped:screen_share_timeout",
        captureOptions: {
          eventType: "screen_share_stopped",
          modules: evidenceCaptureModulesRef.current ?? ["screen_share"],
        },
        metadata: {
          upload_session_id: getExamCaptureSessionId(cid) || undefined,
          reason: "recovery_timeout",
          module: "screen_share",
          module_role: role,
        },
      })
        .then((response) => {
          onEnvironmentPausedRef.current?.(response);
        })
        .catch(() => {
          pipeline.resetInterruption();
          onEnvironmentPausedRef.current?.(null);
        })
        .finally(() => {
          isSubmittingRef.current = false;
          endRuntimeScreenShareReauth(cid, 0);
        });
    }
  }, [pipeline, runtimeReauth.inProgress, runtimeReauth.remainingSeconds]);

  // Clear reauth state when exam ends or monitoring is disabled
  useEffect(() => {
    if (examSubmitted || monitoringDisabled) {
      clearRuntimeScreenShareReauth(contestId);
    }
  }, [contestId, examSubmitted, monitoringDisabled]);

  // Do not clear on unmount: the monitored contest surface can remount while
  // the exam is still active (for example solve <-> dashboard). The recovery
  // countdown must survive that transition so the next mount keeps prompting
  // the student to re-share. Terminal cleanup is handled by examSubmitted /
  // monitoringDisabled and by explicit exam action cleanup.

  return {
    onStreamLost,
    onStreamRestored,
    reauth: {
      active: runtimeReauth.active,
      inProgress: runtimeReauth.inProgress,
      remainingSeconds: runtimeReauth.remainingSeconds ?? null,
    },
  };
}
