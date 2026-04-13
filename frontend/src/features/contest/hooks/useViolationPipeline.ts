/**
 * useViolationPipeline
 *
 * Shared engine for the violation lifecycle: trigger → grace countdown → escalate/recover.
 * Each monitoring hook provides detection logic and calls pipeline.trigger() / pipeline.recover().
 * The pipeline handles timers, event recording, countdown state, and escalation dispatch.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { recordExamEvent } from "@/infrastructure/api/repositories";
import { recordExamEventWithForcedCapture } from "@/features/contest/anticheat/forcedCapture";
import { getExamCaptureSessionId } from "@/shared/state/examCaptureSessionStore";
import { isRuntimeScreenShareReauthActive } from "@/features/contest/anticheat/runtimeReauthState";
import type { ViolationRouteConfig, EscalationAction } from "@/features/contest/domain/violationRoutes";
import type { ForceSubmitRequest } from "./useForceSubmitArbiter";

export interface ForceSubmitExtras {
  /** Override source_module sent to endExam (default: webcam->webcam, otherwise screen_share). */
  sourceModule?: ForceSubmitRequest["sourceModule"];
  /** Override the stopCaptureKey used by captureLifecycle fallback mapping. */
  stopCaptureKey?: ForceSubmitRequest["stopCaptureKey"];
  /** Whether to stop webcam before screen capture (webcam-primary path). */
  stopWebcamFirst?: boolean;
  /** Passed to recordExamEventWithForcedCapture as forceCaptureReason. */
  forceCaptureReason?: string;
}

export interface UseViolationPipelineConfig {
  route: ViolationRouteConfig;
  contestId: string;
  enabled: boolean;
  examSubmitted: boolean;
  /** Override the route's defaultGraceMs (e.g. from anticheat config). */
  recoveryGraceMs?: number;
  /** Override the route's escalation action (e.g. webcam secondary → "log_only"). */
  escalationOverride?: EscalationAction;
  /** Module role for event metadata (e.g. "primary" | "secondary"). */
  moduleRole: string;
  /** Custom suppression check. Defaults to isRuntimeScreenShareReauthActive(contestId). */
  isSuppressed?: () => boolean;
  /** Required for force_submit escalation routes. */
  requestForceSubmit: (req: ForceSubmitRequest) => Promise<void>;
  /** Required for penalized_event escalation routes. */
  onViolation?: (eventType: string, reason: string) => void;
  /**
   * When true, the pipeline does NOT manage its own countdown timer.
   * trigger() / recover() only record events and update isInterrupted.
   * Used by screen_share which delegates countdown to runtimeReauthState.
   */
  externalCountdown?: boolean;
  /** Route-specific overrides for the ForceSubmitRequest built during escalation. */
  forceSubmitExtras?: ForceSubmitExtras;
}

export interface UseViolationPipelineReturn {
  trigger: (metadata?: Record<string, unknown>) => void;
  recover: (reason?: string, metadata?: Record<string, unknown>) => void;
  recoveryCountdown: number | null;
  isInterrupted: boolean;
}

export function useViolationPipeline({
  route,
  contestId,
  enabled,
  examSubmitted,
  recoveryGraceMs,
  escalationOverride,
  moduleRole,
  isSuppressed,
  requestForceSubmit,
  onViolation,
  externalCountdown = false,
  forceSubmitExtras,
}: UseViolationPipelineConfig): UseViolationPipelineReturn {
  const [recoveryCountdown, setRecoveryCountdown] = useState<number | null>(null);
  const [isInterrupted, setIsInterrupted] = useState(false);

  const recoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const interruptedRef = useRef(false);
  const isSubmittingRef = useRef(false);
  const lastEscalatedAtRef = useRef(0);

  // Keep latest props in refs to avoid stale closures
  const contestIdRef = useRef(contestId);
  const moduleRoleRef = useRef(moduleRole);
  const recoveryGraceMsRef = useRef(recoveryGraceMs);
  const requestForceSubmitRef = useRef(requestForceSubmit);
  const onViolationRef = useRef(onViolation);
  const escalationOverrideRef = useRef(escalationOverride);
  const isSuppressedRef = useRef(isSuppressed);
  const forceSubmitExtrasRef = useRef(forceSubmitExtras);

  useEffect(() => { contestIdRef.current = contestId; }, [contestId]);
  useEffect(() => { moduleRoleRef.current = moduleRole; }, [moduleRole]);
  useEffect(() => { recoveryGraceMsRef.current = recoveryGraceMs; }, [recoveryGraceMs]);
  useEffect(() => { requestForceSubmitRef.current = requestForceSubmit; }, [requestForceSubmit]);
  useEffect(() => { onViolationRef.current = onViolation; }, [onViolation]);
  useEffect(() => { escalationOverrideRef.current = escalationOverride; }, [escalationOverride]);
  useEffect(() => { isSuppressedRef.current = isSuppressed; }, [isSuppressed]);
  useEffect(() => { forceSubmitExtrasRef.current = forceSubmitExtras; }, [forceSubmitExtras]);

  const clearRecovery = useCallback(() => {
    if (recoveryTimerRef.current) {
      clearTimeout(recoveryTimerRef.current);
      recoveryTimerRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setRecoveryCountdown(null);
  }, []);

  const resolveEscalation = useCallback((): EscalationAction => {
    return escalationOverrideRef.current ?? route.escalation;
  }, [route.escalation]);

  const defaultIsSuppressed = useCallback((): boolean => {
    return isRuntimeScreenShareReauthActive(contestIdRef.current);
  }, []);

  const checkSuppressed = useCallback((): boolean => {
    const fn = isSuppressedRef.current ?? defaultIsSuppressed;
    return fn();
  }, [defaultIsSuppressed]);

  const ESCALATION_COOLDOWN_MS = 10_000;

  const trigger = useCallback(
    (metadata?: Record<string, unknown>) => {
      if (!enabled || examSubmitted) return;
      if (isSubmittingRef.current) return;
      if (interruptedRef.current) return;
      if (checkSuppressed()) return;
      // After an escalation, suppress re-triggers for a cooldown period to
      // prevent the same ongoing condition from firing repeatedly.
      if (Date.now() - lastEscalatedAtRef.current < ESCALATION_COOLDOWN_MS) return;

      interruptedRef.current = true;
      setIsInterrupted(true);
      const cid = contestIdRef.current;

      // Record triggered event
      const eventIdempotencyKey = `${route.events.triggered}:${Date.now()}`;
      recordExamEvent(cid, route.events.triggered, {
        source: route.eventSource,
        eventIdempotencyKey,
        metadata: {
          reason: `${route.id}_violation`,
          module: route.id,
          module_role: moduleRoleRef.current,
          ...metadata,
        },
      }).catch(() => null);

      // If externalCountdown, skip local timer management
      if (externalCountdown) return;

      // Clear any previous timers
      if (recoveryTimerRef.current) clearTimeout(recoveryTimerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

      const effectiveGraceMs = Math.max(1, recoveryGraceMsRef.current ?? route.defaultGraceMs);
      const recoverySec = Math.ceil(effectiveGraceMs / 1000);
      setRecoveryCountdown(recoverySec);

      countdownIntervalRef.current = setInterval(() => {
        setRecoveryCountdown((prev) => {
          if (prev === null || prev <= 1) return prev;
          return prev - 1;
        });
      }, 1000);

      recoveryTimerRef.current = setTimeout(() => {
        recoveryTimerRef.current = null;
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
        setRecoveryCountdown(null);

        const escalation = resolveEscalation();
        const escalatedKey = `${route.events.escalated}:${Date.now()}`;

        if (escalation === "force_submit") {
          isSubmittingRef.current = true;
          const extras = forceSubmitExtrasRef.current;
          const defaultSourceModule: ForceSubmitRequest["sourceModule"] =
            route.id === "webcam" ? "webcam" : "screen_share";
          const defaultStopCaptureKey: ForceSubmitRequest["stopCaptureKey"] =
            route.id === "screen_share"
              ? "screen_share_timeout_submit"
              : route.id === "viewport"
                ? "viewport_timeout_submit"
                : "manual";
          requestForceSubmitRef.current({
            reason: `Force submit after ${route.id} recovery timeout`,
            sourceModule: extras?.sourceModule ?? defaultSourceModule,
            stopCaptureKey: extras?.stopCaptureKey ?? defaultStopCaptureKey,
            stopWebcamFirst: extras?.stopWebcamFirst,
            onRecording: async () => {
              await recordExamEvent(contestIdRef.current, route.events.escalated, {
                source: route.eventSource,
                eventIdempotencyKey: escalatedKey,
                metadata: {
                  reason: "recovery_timeout",
                  module: route.id,
                  module_role: moduleRoleRef.current,
                },
              }).catch(() => null);
              await recordExamEventWithForcedCapture(contestIdRef.current, "exam_submit_initiated", {
                reason: `Force submit after ${route.id} recovery timeout`,
                source: `exam_mode:${route.id}_recovery_timeout`,
                forceCaptureReason: extras?.forceCaptureReason,
                captureOptions: {
                  eventType: "exam_submit_initiated",
                  modules: [extras?.sourceModule ?? defaultSourceModule],
                },
                metadata: {
                  upload_session_id: getExamCaptureSessionId(contestIdRef.current) || undefined,
                  module: route.id,
                  module_role: moduleRoleRef.current,
                },
              }).catch(() => null);
            },
            onFinally: () => { isSubmittingRef.current = false; },
          });
        } else if (escalation === "penalized_event") {
          onViolationRef.current?.(route.events.escalated, `${route.id}_recovery_timeout`);
        } else {
          // log_only
          recordExamEvent(contestIdRef.current, route.events.escalated, {
            source: route.eventSource,
            eventIdempotencyKey: escalatedKey,
            metadata: {
              reason: "recovery_timeout",
              module: route.id,
              module_role: moduleRoleRef.current,
            },
          }).catch(() => null);
        }

        // Reset interrupted state after escalation so pipeline can retrigger,
        // but record the time so the cooldown guard prevents immediate re-fire.
        lastEscalatedAtRef.current = Date.now();
        interruptedRef.current = false;
        setIsInterrupted(false);
      }, effectiveGraceMs);
    },
    [enabled, examSubmitted, externalCountdown, route, checkSuppressed, resolveEscalation],
  );

  const recover = useCallback(
    (reason?: string, metadata?: Record<string, unknown>) => {
      if (!interruptedRef.current) return;
      interruptedRef.current = false;
      setIsInterrupted(false);

      if (!externalCountdown) {
        clearRecovery();
      }

      if (route.events.restored) {
        const eventIdempotencyKey = `${route.events.restored}:${Date.now()}`;
        recordExamEvent(contestIdRef.current, route.events.restored, {
          source: route.eventSource,
          eventIdempotencyKey,
          metadata: {
            reason: reason ?? `${route.id}_recovered`,
            module: route.id,
            module_role: moduleRoleRef.current,
            ...metadata,
          },
        }).catch(() => null);
      }
    },
    [externalCountdown, route, clearRecovery],
  );

  // Reset on disable / exam submit — intentional synchronous setState to clear stale UI
  useEffect(() => {
    if (!enabled || examSubmitted) {
      interruptedRef.current = false;
      setIsInterrupted(false); // eslint-disable-line react-hooks/set-state-in-effect
      if (!externalCountdown) {
        clearRecovery();
      }
    }
  }, [enabled, examSubmitted, externalCountdown, clearRecovery]);

  // Unmount cleanup
  useEffect(() => {
    return () => {
      if (!externalCountdown) {
        clearRecovery();
      }
    };
  }, [externalCountdown, clearRecovery]);

  return {
    trigger,
    recover,
    recoveryCountdown: externalCountdown ? null : recoveryCountdown,
    isInterrupted,
  };
}
