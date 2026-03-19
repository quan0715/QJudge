import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import type { ReactNode } from "react";
import type { ExamStatusType } from "@/core/entities/contest.entity";
import { endExam as serviceEndExam, recordExamEvent } from "@/infrastructure/api/repositories";
import { getExamCaptureSessionId } from "@/shared/state/examCaptureSessionStore";
import { useNavigate, useLocation } from "react-router-dom";
import { ExamOverlays } from "@/features/contest/components/exam/ExamOverlays";
import { ExamModals } from "@/features/contest/components/exam/ExamModals";
import { useContestTimers } from "@/features/contest/hooks/useContestTimers";
import { useExamState } from "@/features/contest/hooks/useExamState";
import { useExamMonitoring } from "@/features/contest/hooks/useExamMonitoring";
import { useExamHeartbeat } from "@/features/contest/hooks/useExamHeartbeat";
import { getContestDashboardPath } from "@/features/contest/domain/contestRoutePolicy";
import { useToast } from "@/shared/contexts/ToastContext";
import { createFullscreenAdapter } from "@/features/contest/anticheat/fullscreenAdapter";
import { syncAnticheatPhaseWithExamStatus } from "@/features/contest/anticheat/orchestrator";
import { recordExamEventWithForcedCapture } from "@/features/contest/anticheat/forcedCapture";
import {
  useRuntimeScreenShareReauth,
  beginRuntimeScreenShareReauth,
  endRuntimeScreenShareReauth,
  clearRuntimeScreenShareReauth,
  isRuntimeScreenShareReauthActive,
} from "@/features/contest/anticheat/runtimeReauthState";
import { hasExamPrecheckPassed } from "@/features/contest/screens/paperExam/hooks";
import { useAnticheatScreenCapture } from "@/features/contest/screens/paperExam/hooks/useAnticheatScreenCapture";
import { useAnticheatWebcamCapture } from "@/features/contest/screens/paperExam/hooks/useAnticheatWebcamCapture";
import { ExamCaptureProvider } from "@/features/contest/contexts/ExamCaptureContext";
import { createStreamAdapter } from "@/features/contest/anticheat/streamAdapter";
import { setRuntimeScreenShareHandoff } from "@/features/contest/anticheat/screenShareHandoffStore";
import { setRuntimeWebcamHandoff } from "@/features/contest/anticheat/webcamHandoffStore";
import { requestUserMediaVideo, supportsUserMediaApi } from "@/features/contest/anticheat/mediaApi";
import {
  applyExamMonitoringPolicyOverrides,
  SCREEN_SHARE_RECOVERY_GRACE_MS,
} from "@/features/contest/domain/examMonitoringPolicy";
import { useContestAnticheatConfig } from "@/features/contest/hooks/useContestAnticheatConfig";
import { useTranslation } from "react-i18next";
import useExamSubmissionProgress from "@/features/contest/hooks/useExamSubmissionProgress";
import ExamSubmissionProgressModal from "@/features/contest/components/exam/ExamSubmissionProgressModal";
import { stopCaptureForContest } from "@/features/contest/anticheat/captureLifecycle";
import {
  detectAnticheatCapability,
  resolveDeviceMonitoringPlan,
} from "@/features/contest/domain/anticheatModulePolicy";

interface ExamModeWrapperProps {
  contestId: string;
  cheatDetectionEnabled: boolean;
  isExamMonitored: boolean;
  requiresFullscreen: boolean;
  hasEnded?: boolean;
  lockReason?: string;
  examStatus?: ExamStatusType;
  onRefresh?: () => Promise<void>;
  children: ReactNode;
}

const isMonitoredStatus = (status?: ExamStatusType) =>
  status === "in_progress" ||
  status === "paused" ||
  status === "locked" ||
  status === "locked_takeover";

const VIEWPORT_CHECK_INTERVAL_MS = 1_000;
const VIEWPORT_COVERAGE_MIN = 0.82;
const VIEWPORT_ASPECT_DELTA_MAX = 0.18;
const VIEWPORT_SCALE_TOLERANCE = 0.02;
const VIEWPORT_KEYBOARD_HEIGHT_RATIO = 0.86;
const VIEWPORT_KEYBOARD_WIDTH_DELTA_MAX = 0.06;
// Tablet-specific thresholds (stricter because split view is common)
const VIEWPORT_COVERAGE_MIN_TABLET = 0.92;
const VIEWPORT_ASPECT_DELTA_MAX_TABLET = 0.10;

interface ViewportSnapshot {
  width: number;
  height: number;
  scale: number;
  aspect: number;
  screenArea: number;
}

const getViewportSnapshot = (): ViewportSnapshot => {
  const viewport = window.visualViewport;
  const width = viewport?.width ?? window.innerWidth;
  const height = viewport?.height ?? window.innerHeight;
  const scale = viewport?.scale ?? 1;
  // Use screen.width/height directly — they report the physical screen size,
  // which is the correct ground truth for coverage calculation (especially on iPad PWA).
  const screenW = window.screen.width || width;
  const screenH = window.screen.height || height;
  return {
    width,
    height,
    scale,
    aspect: width > 0 && height > 0 ? width / height : 1,
    screenArea: Math.max(1, screenW * screenH),
  };
};

const isTextInputFocused = (): boolean => {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return false;
  const tag = active.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || active.isContentEditable;
};

const ExamModeWrapper: React.FC<ExamModeWrapperProps> = ({
  contestId,
  cheatDetectionEnabled,
    isExamMonitored,
    requiresFullscreen,
    hasEnded = false,
    lockReason,
    examStatus,
    onRefresh,
    children,
  }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const containerRef = useRef<HTMLDivElement>(null);
  const lastBlockedActionToastAt = useRef<number>(0);
  const fullscreenAdapterRef = useRef(createFullscreenAdapter());
  const runtimeReauth = useRuntimeScreenShareReauth(contestId);
  const runtimeReauthActive = runtimeReauth.active;
  const { showToast } = useToast();
  const submissionProgress = useExamSubmissionProgress();
  const streamAdapterRef = useRef(createStreamAdapter());
  const { t } = useTranslation("contest");
  const {
    config: anticheatConfig,
    loading: anticheatConfigLoading,
    refresh: refreshAnticheatConfig,
  } = useContestAnticheatConfig(contestId);
  const anticheatEffective = anticheatConfig?.effective;
  const capability = detectAnticheatCapability();
  const monitoringPlan = resolveDeviceMonitoringPlan(
    capability,
    anticheatConfig?.devicePolicy ?? anticheatEffective?.anticheatDevicePolicy
  );
  const effectiveRequiresFullscreen =
    requiresFullscreen &&
    monitoringPlan.detectors.fullscreen &&
    !monitoringPlan.precheck.requirePwaMode;
  const screenModuleRole = monitoringPlan.sources.screenShare.role ?? "secondary";
  const webcamModuleRole = monitoringPlan.sources.webcam.role ?? "secondary";
  const primarySourceModule: "screen_share" | "webcam" = monitoringPlan.primarySourceModule;
  const policyRequired = cheatDetectionEnabled && (isExamMonitored || isMonitoredStatus(examStatus));
  const policyUnavailable =
    policyRequired &&
    !anticheatConfigLoading &&
    (!anticheatConfig || !monitoringPlan.allowed);
  const effectiveMonitoringEnabled = policyRequired && !!anticheatEffective && !policyUnavailable;
  const pwaGuardFailed =
    effectiveMonitoringEnabled &&
    monitoringPlan.precheck.requirePwaMode &&
    !capability.isPwaMode;

  useEffect(() => {
    if (!anticheatEffective) return;
    applyExamMonitoringPolicyOverrides({
      monitoringRecoveryGraceMs: anticheatEffective.monitoringRecoveryGraceMs,
      mouseLeaveCooldownMs: anticheatEffective.mouseLeaveCooldownMs,
      screenShareRecoveryGraceMs: anticheatEffective.screenShareRecoveryGraceMs,
      multiDisplayCheckIntervalMs: anticheatEffective.multiDisplayCheckIntervalMs,
      multiDisplayReportCooldownMs: anticheatEffective.multiDisplayReportCooldownMs,
    });
  }, [anticheatEffective]);

  const {
    examState,
    showWarning,
    warningEventType,
    pendingApiResponse,
    lastApiResponse,
    warningCountdown,
    showUnlockNotification,
    handleViolation,
    handleWarningClose,
    handleUnlockContinue,
  } = useExamState({
    contestId,
    examStatus,
    isExamMonitored: effectiveMonitoringEnabled,
    lockReason,
    isBypassed: false,
    onRefresh,
    requestFullscreen: fullscreenAdapterRef.current.request,
    warningTimeoutSeconds: anticheatEffective?.warningTimeoutSeconds,
  });

  const precheckPassed = contestId ? hasExamPrecheckPassed(contestId) : false;
  const screenCaptureEnabled =
    effectiveMonitoringEnabled && precheckPassed && monitoringPlan.runtime.enableScreenShareCapture;
  const webcamCaptureEnabled =
    effectiveMonitoringEnabled && precheckPassed && monitoringPlan.runtime.enableWebcamCapture;
  const viewportMonitorEnabled =
    effectiveMonitoringEnabled && precheckPassed && monitoringPlan.runtime.enableViewportIntegrity;
  const hasSentScreenDegradedRef = useRef(false);
  const hasSentWebcamDegradedRef = useRef(false);
  const onScreenShareLostRef = useRef<(() => void) | undefined>(undefined);
  const onWebcamLostRef = useRef<(() => void) | undefined>(undefined);
  const reportDegraded = useCallback((isDegraded: boolean) => {
    if (!isDegraded) {
      hasSentScreenDegradedRef.current = false;
      return;
    }
    if (hasSentScreenDegradedRef.current) return;
    hasSentScreenDegradedRef.current = true;
    recordExamEvent(contestId, "capture_upload_degraded", {
      reason: "Upload retries exhausted",
      source: "exam_mode:capture_degraded",
      metadata: {
        upload_session_id: getExamCaptureSessionId(contestId) || undefined,
        module: "screen_share",
        module_role: screenModuleRole,
      },
    }).catch(() => {});
  }, [contestId, screenModuleRole]);
  const reportWebcamDegraded = useCallback((isDegraded: boolean) => {
    if (!isDegraded) {
      hasSentWebcamDegradedRef.current = false;
      return;
    }
    if (hasSentWebcamDegradedRef.current) return;
    hasSentWebcamDegradedRef.current = true;
    recordExamEvent(contestId, "capture_upload_degraded", {
      reason: "Webcam upload retries exhausted",
      source: "exam_mode:webcam_capture_degraded",
      metadata: {
        upload_session_id: getExamCaptureSessionId(contestId) || undefined,
        module: "webcam",
        module_role: webcamModuleRole,
      },
    }).catch(() => {});
  }, [contestId, webcamModuleRole]);
  const streamMonitorEnabled = policyRequired && !policyUnavailable;
  const screenStreamMonitorEnabled = streamMonitorEnabled && monitoringPlan.runtime.monitorScreenShareStream;
  const webcamStreamMonitorEnabled = streamMonitorEnabled && monitoringPlan.runtime.monitorWebcamStream;
  const monitoringDetectorPolicy = useMemo(
    () => ({
      fullscreen: monitoringPlan.detectors.fullscreen,
      focus: monitoringPlan.detectors.focus,
      tabVisibility: monitoringPlan.detectors.tabVisibility,
      multiDisplay: monitoringPlan.detectors.multiDisplay,
      mouseLeave: monitoringPlan.detectors.mouseLeave,
    }),
    [
      monitoringPlan.detectors.fullscreen,
      monitoringPlan.detectors.focus,
      monitoringPlan.detectors.tabVisibility,
      monitoringPlan.detectors.multiDisplay,
      monitoringPlan.detectors.mouseLeave,
    ]
  );
  const viewportRecoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewportCountdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const viewportInterruptedRef = useRef(false);
  const viewportBaselineRef = useRef<ViewportSnapshot | null>(null);
  const [viewportRecoveryCountdown, setViewportRecoveryCountdown] = useState<number | null>(null);

  const capture = useAnticheatScreenCapture({
    contestId,
    enabled: screenCaptureEnabled,
    monitorStream: screenStreamMonitorEnabled,
    preserveStreamOnUnmount: cheatDetectionEnabled && examStatus !== "submitted" && !hasEnded,
    expectInitialStream:
      precheckPassed && examStatus === "in_progress" && monitoringPlan.precheck.requireScreenShare,
    intervalMs: Math.max(1, monitoringPlan.sources.screenShare.captureIntervalSeconds) * 1000,
    maxRetries: anticheatEffective ? Math.max(1, anticheatEffective.captureUploadMaxRetries) : undefined,
    forcedCaptureCooldownMs: anticheatEffective
      ? Math.max(1, anticheatEffective.forcedCaptureCooldownMs)
      : undefined,
    forcedCaptureP1CooldownMs: anticheatEffective
      ? Math.max(1, anticheatEffective.forcedCaptureP1CooldownMs)
      : undefined,
    reportDegraded,
    onScreenShareLost: () => {
      onScreenShareLostRef.current?.();
    },
  });
  const webcamCapture = useAnticheatWebcamCapture({
    contestId,
    enabled: webcamCaptureEnabled,
    monitorStream: webcamStreamMonitorEnabled,
    preserveStreamOnUnmount: cheatDetectionEnabled && examStatus !== "submitted" && !hasEnded,
    expectInitialStream:
      precheckPassed && examStatus === "in_progress" && monitoringPlan.precheck.enableWebcam,
    autoAcquireOnStart: false,
    intervalMs: Math.max(1, monitoringPlan.sources.webcam.captureIntervalSeconds) * 1000,
    maxRetries: anticheatEffective ? Math.max(1, anticheatEffective.captureUploadMaxRetries) : undefined,
    reportDegraded: reportWebcamDegraded,
    onWebcamLost: () => {
      onWebcamLostRef.current?.();
    },
  });
  const { forceStopCapture } = capture;
  const { forceStopCapture: forceStopWebcamCapture } = webcamCapture;
  const handleBlockedAction = useCallback((message: string) => {
    const now = Date.now();
    if (now - lastBlockedActionToastAt.current < 1000) {
      return;
    }
    lastBlockedActionToastAt.current = now;
    showToast({
      kind: "warning",
      title: message,
      timeout: 2000,
    });
  }, [showToast]);

  const [showFullscreenExitConfirm, setShowFullscreenExitConfirm] = useState(false);
  const [isSubmittingFromFullscreenExit, setIsSubmittingFromFullscreenExit] = useState(false);
  const [recoveryCountdown, setRecoveryCountdown] = useState<number | null>(null);
  const [recoverySource, setRecoverySource] = useState<"fullscreen" | "mouse-leave" | null>(null);
  const initialFullscreenCheckDone = useRef(false);

  const [isRequestingScreenShare, setIsRequestingScreenShare] = useState(false);
  const [isRequestingWebcam, setIsRequestingWebcam] = useState(false);
  const [isSubmittingFromScreenShareLoss, setIsSubmittingFromScreenShareLoss] = useState(false);
  const hasTriggeredScreenShareTimeoutSubmitRef = useRef(false);
  const webcamRecoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const webcamCountdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const webcamInterruptedRef = useRef(false);
  const [webcamRecoveryCountdown, setWebcamRecoveryCountdown] = useState<number | null>(null);
  const [isSubmittingFromWebcamLoss, setIsSubmittingFromWebcamLoss] = useState(false);
  const [isSubmittingFromViewportLoss, setIsSubmittingFromViewportLoss] = useState(false);

  const [showAutoSubmitNotice, setShowAutoSubmitNotice] = useState(false);

  const handleForceSubmitFromScreenShareLoss = useCallback(async () => {
    setIsSubmittingFromScreenShareLoss(true);
    try {
      const success = await submissionProgress.run({
        handlers: {
          recording: async () => {
            await recordExamEvent(contestId, "screen_share_stopped", {
              source: "anticheat:screen_capture",
              metadata: {
                reason: "recovery_timeout",
                module: "screen_share",
                module_role: screenModuleRole,
              },
            }).catch(() => null);
            await recordExamEventWithForcedCapture(contestId, "exam_submit_initiated", {
              reason: "Force submit after screen share recovery timeout",
              source: "exam_mode:screen_share_recovery_timeout",
              forceCaptureReason: "exam_submit_initiated:screen_share_timeout",
              metadata: {
                upload_session_id: getExamCaptureSessionId(contestId) || undefined,
                module: "screen_share",
                module_role: screenModuleRole,
              },
            }).catch(() => null);
          },
          finalizing: async () => {
            await serviceEndExam(contestId, {
              upload_session_id: getExamCaptureSessionId(contestId) || undefined,
              source_module: "screen_share",
            });
            const stopResult = stopCaptureForContest(contestId, "screen_share_timeout_submit");
            if (!stopResult) {
              forceStopCapture("screen_share_timeout_submit");
            }
            forceStopWebcamCapture();
            if (onRefresh) await onRefresh();
          },
        },
      });

      if (success) {
        setShowAutoSubmitNotice(true);
      }
    } catch {
      // best effort: submission fallback should not block cleanup
    } finally {
      setIsSubmittingFromScreenShareLoss(false);
      endRuntimeScreenShareReauth(contestId, 0);
    }
  }, [contestId, forceStopCapture, forceStopWebcamCapture, onRefresh, screenModuleRole, submissionProgress]);

  const handleForceSubmitFromWebcamLoss = useCallback(async () => {
    if (webcamModuleRole !== "primary") return;
    setIsSubmittingFromWebcamLoss(true);
    try {
      const success = await submissionProgress.run({
        handlers: {
          recording: async () => {
            await recordExamEvent(contestId, "webcam_stopped", {
              source: "anticheat:webcam_capture",
              metadata: {
                reason: "recovery_timeout",
                module: "webcam",
                module_role: webcamModuleRole,
              },
            }).catch(() => null);
            await recordExamEventWithForcedCapture(contestId, "exam_submit_initiated", {
              reason: "Force submit after webcam recovery timeout",
              source: "exam_mode:webcam_recovery_timeout",
              metadata: {
                upload_session_id: getExamCaptureSessionId(contestId) || undefined,
                module: "webcam",
                module_role: webcamModuleRole,
              },
            }).catch(() => null);
          },
          finalizing: async () => {
            await serviceEndExam(contestId, {
              upload_session_id: getExamCaptureSessionId(contestId) || undefined,
              source_module: "webcam",
            });
            forceStopWebcamCapture();
            const stopResult = stopCaptureForContest(contestId, "manual");
            if (!stopResult) {
              forceStopCapture("manual");
            }
            if (onRefresh) await onRefresh();
          },
        },
      });

      if (success) {
        setShowAutoSubmitNotice(true);
      }
    } catch {
      // best effort
    } finally {
      setIsSubmittingFromWebcamLoss(false);
    }
  }, [
    contestId,
    forceStopCapture,
    forceStopWebcamCapture,
    onRefresh,
    submissionProgress,
    webcamModuleRole,
  ]);

  const handleForceSubmitFromViewportLoss = useCallback(async () => {
    if (!viewportMonitorEnabled) return;
    setIsSubmittingFromViewportLoss(true);
    const stoppedEventType = capability.isTablet ? "split_view_detected" : "viewport_stopped";
    try {
      const success = await submissionProgress.run({
        handlers: {
          recording: async () => {
            const eventIdempotencyKey = `${stoppedEventType}:${Date.now()}`;
            await recordExamEvent(contestId, stoppedEventType, {
              source: "anticheat:viewport_integrity",
              eventIdempotencyKey,
              metadata: {
                reason: "recovery_timeout",
                module: primarySourceModule,
                module_role: "primary",
              },
            }).catch(() => null);
            await recordExamEventWithForcedCapture(contestId, "exam_submit_initiated", {
              reason: capability.isTablet
                ? "Force submit after split view recovery timeout"
                : "Force submit after viewport integrity recovery timeout",
              source: "exam_mode:viewport_recovery_timeout",
              metadata: {
                upload_session_id: getExamCaptureSessionId(contestId) || undefined,
                module: primarySourceModule,
                module_role: "primary",
              },
            }).catch(() => null);
          },
          finalizing: async () => {
            await serviceEndExam(contestId, {
              upload_session_id: getExamCaptureSessionId(contestId) || undefined,
              source_module: primarySourceModule,
            });
            const stopResult = stopCaptureForContest(contestId, "viewport_timeout_submit");
            if (!stopResult) {
              forceStopCapture("viewport_timeout_submit");
            }
            forceStopWebcamCapture();
            if (onRefresh) await onRefresh();
          },
        },
      });

      if (success) {
        setShowAutoSubmitNotice(true);
      }
    } catch {
      // best effort
    } finally {
      setIsSubmittingFromViewportLoss(false);
    }
  }, [
    capability.isTablet,
    contestId,
    forceStopCapture,
    forceStopWebcamCapture,
    onRefresh,
    primarySourceModule,
    submissionProgress,
    viewportMonitorEnabled,
  ]);

  const handleWebcamLost = useCallback(() => {
    if (examStatus === "submitted") return;
    if (!webcamStreamMonitorEnabled) return;
    if (isSubmittingFromWebcamLoss) return;
    if (webcamInterruptedRef.current) return;

    webcamInterruptedRef.current = true;
    recordExamEvent(contestId, "webcam_interrupted", {
      source: "anticheat:webcam_capture",
      metadata: {
        reason: "stream_ended",
        module: "webcam",
        module_role: webcamModuleRole,
      },
    }).catch(() => null);

    if (webcamRecoveryTimerRef.current) {
      clearTimeout(webcamRecoveryTimerRef.current);
    }
    if (webcamCountdownIntervalRef.current) {
      clearInterval(webcamCountdownIntervalRef.current);
    }
    const recoveryMs = Math.max(1, anticheatEffective?.webcamRecoveryGraceMs ?? 10_000);
    const recoverySec = Math.ceil(recoveryMs / 1000);
    setWebcamRecoveryCountdown(recoverySec);
    webcamCountdownIntervalRef.current = setInterval(() => {
      setWebcamRecoveryCountdown((prev) => {
        if (prev === null || prev <= 1) return prev;
        return prev - 1;
      });
    }, 1000);
    webcamRecoveryTimerRef.current = setTimeout(() => {
      webcamRecoveryTimerRef.current = null;
      if (webcamCountdownIntervalRef.current) {
        clearInterval(webcamCountdownIntervalRef.current);
        webcamCountdownIntervalRef.current = null;
      }
      setWebcamRecoveryCountdown(null);
      if (webcamModuleRole === "primary") {
        void handleForceSubmitFromWebcamLoss();
        return;
      }
      recordExamEvent(contestId, "webcam_stopped", {
        source: "anticheat:webcam_capture",
        metadata: {
          reason: "recovery_timeout",
          module: "webcam",
          module_role: webcamModuleRole,
        },
      }).catch(() => null);
    }, recoveryMs);
  }, [
    anticheatEffective?.webcamRecoveryGraceMs,
    contestId,
    examStatus,
    handleForceSubmitFromWebcamLoss,
    isSubmittingFromWebcamLoss,
    webcamModuleRole,
    webcamStreamMonitorEnabled,
  ]);
  onWebcamLostRef.current = handleWebcamLost;

  const handleScreenShareLost = useCallback(() => {
    if (examStatus === "submitted") return;
    if (!screenStreamMonitorEnabled) return;
    if (isRuntimeScreenShareReauthActive(contestId)) return;
    const recoveryMs = Math.max(
      1,
      anticheatEffective?.screenShareRecoveryGraceMs ?? SCREEN_SHARE_RECOVERY_GRACE_MS,
    );
    recordExamEvent(contestId, "screen_share_interrupted", {
      source: "anticheat:screen_capture",
      metadata: {
        reason: "stream_ended",
        module: "screen_share",
        module_role: screenModuleRole,
      },
    }).catch(() => null);
    beginRuntimeScreenShareReauth(contestId, recoveryMs);
  }, [
    anticheatEffective?.screenShareRecoveryGraceMs,
    contestId,
    examStatus,
    screenModuleRole,
    screenStreamMonitorEnabled,
  ]);
  onScreenShareLostRef.current = handleScreenShareLost;

  const handleViewportInterrupted = useCallback(
    (payload: { coverage: number; aspectDelta: number; scaleDelta: number; keyboardLikely: boolean }, isTablet?: boolean) => {
      if (examStatus === "submitted") return;
      if (!viewportMonitorEnabled) return;
      if (isSubmittingFromViewportLoss) return;
      if (viewportInterruptedRef.current) return;

      viewportInterruptedRef.current = true;
      const eventType = isTablet ? "split_view_detected" : "viewport_interrupted";
      const eventIdempotencyKey = `${eventType}:${Date.now()}`;
      recordExamEvent(contestId, eventType, {
        source: "anticheat:viewport_integrity",
        eventIdempotencyKey,
        metadata: {
          reason: isTablet ? "split_view_or_slide_over" : "viewport_integrity_violation",
          module: primarySourceModule,
          module_role: "primary",
          coverage: payload.coverage,
          aspect_delta: payload.aspectDelta,
          scale_delta: payload.scaleDelta,
          keyboard_likely: payload.keyboardLikely,
        },
      }).catch(() => null);

      if (viewportRecoveryTimerRef.current) {
        clearTimeout(viewportRecoveryTimerRef.current);
      }
      if (viewportCountdownIntervalRef.current) {
        clearInterval(viewportCountdownIntervalRef.current);
      }
      // Viewport/split-view should recover quickly, like fullscreen exit
      const recoveryMs = Math.max(1, anticheatEffective?.monitoringRecoveryGraceMs ?? 3_000);
      const recoverySec = Math.ceil(recoveryMs / 1000);
      setViewportRecoveryCountdown(recoverySec);
      viewportCountdownIntervalRef.current = setInterval(() => {
        setViewportRecoveryCountdown((prev) => {
          if (prev === null || prev <= 1) return prev;
          return prev - 1;
        });
      }, 1000);
      viewportRecoveryTimerRef.current = setTimeout(() => {
        viewportRecoveryTimerRef.current = null;
        if (viewportCountdownIntervalRef.current) {
          clearInterval(viewportCountdownIntervalRef.current);
          viewportCountdownIntervalRef.current = null;
        }
        setViewportRecoveryCountdown(null);
        void handleForceSubmitFromViewportLoss();
      }, recoveryMs);
    },
    [
      anticheatEffective?.webcamRecoveryGraceMs,
      contestId,
      examStatus,
      handleForceSubmitFromViewportLoss,
      isSubmittingFromViewportLoss,
      primarySourceModule,
      viewportMonitorEnabled,
    ]
  );

  const handleViewportRestored = useCallback(
    (payload: { coverage: number; aspectDelta: number; scaleDelta: number; keyboardLikely: boolean }) => {
      if (!viewportInterruptedRef.current) return;
      viewportInterruptedRef.current = false;
      if (viewportRecoveryTimerRef.current) {
        clearTimeout(viewportRecoveryTimerRef.current);
        viewportRecoveryTimerRef.current = null;
      }
      if (viewportCountdownIntervalRef.current) {
        clearInterval(viewportCountdownIntervalRef.current);
        viewportCountdownIntervalRef.current = null;
      }
      setViewportRecoveryCountdown(null);
      const eventIdempotencyKey = `viewport_restored:${Date.now()}`;
      recordExamEvent(contestId, "viewport_restored", {
        source: "anticheat:viewport_integrity",
        eventIdempotencyKey,
        metadata: {
          reason: "viewport_integrity_recovered",
          module: primarySourceModule,
          module_role: "primary",
          coverage: payload.coverage,
          aspect_delta: payload.aspectDelta,
          scale_delta: payload.scaleDelta,
          keyboard_likely: payload.keyboardLikely,
        },
      }).catch(() => null);
    },
    [contestId, primarySourceModule]
  );

  useEffect(() => {
    if (!viewportMonitorEnabled || examStatus === "submitted") {
      viewportBaselineRef.current = null;
      viewportInterruptedRef.current = false;
      if (viewportRecoveryTimerRef.current) {
        clearTimeout(viewportRecoveryTimerRef.current);
        viewportRecoveryTimerRef.current = null;
      }
      return;
    }

    const resetBaseline = () => {
      viewportBaselineRef.current = getViewportSnapshot();
    };
    resetBaseline();

    const evaluateViewportIntegrity = () => {
      const baseline = viewportBaselineRef.current;
      if (!baseline) {
        resetBaseline();
        return;
      }
      const current = getViewportSnapshot();
      if (current.width <= 0 || current.height <= 0) return;

      const currentArea = current.width * current.height;
      const baselineArea = Math.max(1, baseline.width * baseline.height);
      const coverageByScreen = currentArea / Math.max(1, current.screenArea);
      const coverageByBaseline = currentArea / baselineArea;
      // Tablet: always compare against physical screen to avoid tainted baseline
      const coverage = capability.isTablet
        ? coverageByScreen
        : Math.min(coverageByScreen, coverageByBaseline);
      const aspectDelta =
        baseline.aspect > 0 ? Math.abs(current.aspect - baseline.aspect) / baseline.aspect : 0;
      const scaleDelta = Math.abs(current.scale - 1);
      const keyboardLikely =
        isTextInputFocused() &&
        current.height < baseline.height * VIEWPORT_KEYBOARD_HEIGHT_RATIO &&
        Math.abs(current.width - baseline.width) / Math.max(1, baseline.width) <
          VIEWPORT_KEYBOARD_WIDTH_DELTA_MAX;

      // Use stricter thresholds on tablet to catch split view / slide over
      const coverageMin = capability.isTablet ? VIEWPORT_COVERAGE_MIN_TABLET : VIEWPORT_COVERAGE_MIN;
      const aspectMax = capability.isTablet ? VIEWPORT_ASPECT_DELTA_MAX_TABLET : VIEWPORT_ASPECT_DELTA_MAX;
      const abnormal =
        !keyboardLikely &&
        (coverage < coverageMin ||
          aspectDelta > aspectMax ||
          scaleDelta > VIEWPORT_SCALE_TOLERANCE);

      const payload = {
        coverage: Number(coverage.toFixed(4)),
        aspectDelta: Number(aspectDelta.toFixed(4)),
        scaleDelta: Number(scaleDelta.toFixed(4)),
        keyboardLikely,
      };

      if (abnormal) {
        handleViewportInterrupted(payload, capability.isTablet);
        return;
      }
      handleViewportRestored(payload);
    };

    const onOrientationChange = () => {
      resetBaseline();
      handleViewportRestored({
        coverage: 1,
        aspectDelta: 0,
        scaleDelta: 0,
        keyboardLikely: false,
      });
    };

    const intervalId = window.setInterval(evaluateViewportIntegrity, VIEWPORT_CHECK_INTERVAL_MS);
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", evaluateViewportIntegrity);
    window.addEventListener("resize", evaluateViewportIntegrity);
    window.addEventListener("orientationchange", onOrientationChange);
    document.addEventListener("visibilitychange", evaluateViewportIntegrity);

    evaluateViewportIntegrity();

    return () => {
      window.clearInterval(intervalId);
      viewport?.removeEventListener("resize", evaluateViewportIntegrity);
      window.removeEventListener("resize", evaluateViewportIntegrity);
      window.removeEventListener("orientationchange", onOrientationChange);
      document.removeEventListener("visibilitychange", evaluateViewportIntegrity);
    };
  }, [
    examStatus,
    handleViewportInterrupted,
    handleViewportRestored,
    viewportMonitorEnabled,
  ]);

  const handleScreenShareReacquire = useCallback(async () => {
    setIsRequestingScreenShare(true);
    try {
      const stream = await streamAdapterRef.current.acquireMonitorStream();
      if (stream) {
        setRuntimeScreenShareHandoff(stream);
        endRuntimeScreenShareReauth(contestId);
        recordExamEvent(contestId, "screen_share_restored", {
          source: "anticheat:screen_capture",
          metadata: {
            reason: "user_reshared",
            module: "screen_share",
            module_role: screenModuleRole,
          },
        }).catch(() => null);
        if (effectiveRequiresFullscreen && !fullscreenAdapterRef.current.isActive()) {
          void fullscreenAdapterRef.current.request();
        }
      }
    } finally {
      setIsRequestingScreenShare(false);
    }
  }, [contestId, effectiveRequiresFullscreen, screenModuleRole]);

  const handleWebcamReacquire = useCallback(async () => {
    if (!supportsUserMediaApi()) return;
    setIsRequestingWebcam(true);
    try {
      const stream = await requestUserMediaVideo();
      const track = stream.getVideoTracks()[0];
      if (!track || track.readyState !== "live") {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      setRuntimeWebcamHandoff(stream);
      // Clear recovery state
      webcamInterruptedRef.current = false;
      if (webcamRecoveryTimerRef.current) {
        clearTimeout(webcamRecoveryTimerRef.current);
        webcamRecoveryTimerRef.current = null;
      }
      if (webcamCountdownIntervalRef.current) {
        clearInterval(webcamCountdownIntervalRef.current);
        webcamCountdownIntervalRef.current = null;
      }
      setWebcamRecoveryCountdown(null);
      recordExamEvent(contestId, "webcam_restored", {
        source: "anticheat:webcam_capture",
        metadata: {
          reason: "user_reauthorized",
          module: "webcam",
          module_role: webcamModuleRole,
        },
      }).catch(() => null);
    } catch {
      // user denied or error — do nothing, countdown continues
    } finally {
      setIsRequestingWebcam(false);
    }
  }, [contestId, webcamModuleRole]);

  const handleTraceEvent = useCallback((eventType: string, reason: string) => {
    recordExamEvent(contestId, eventType, {
      source: "anticheat:trace",
      metadata: { reason },
    }).catch(() => null);
  }, [contestId]);

  useExamMonitoring({
    contestId,
    enabled: effectiveMonitoringEnabled,
    enforceFullscreen: effectiveRequiresFullscreen,
    detectorPolicy: monitoringDetectorPolicy,
    onViolation: handleViolation,
    onBlockedAction: handleBlockedAction,
    onRecoveryCountdownChange: (secondsLeft, source) => {
      if (isRuntimeScreenShareReauthActive(contestId)) {
        setRecoveryCountdown(null);
        setRecoverySource(null);
        return;
      }
      setRecoveryCountdown(secondsLeft);
      setRecoverySource(secondsLeft != null ? source : null);
    },
    onTraceEvent: handleTraceEvent,
  });

  useEffect(() => {
    if (runtimeReauthActive && recoveryCountdown != null) {
      setRecoveryCountdown(null);
      setRecoverySource(null);
    }
  }, [runtimeReauthActive, recoveryCountdown]);

  useEffect(() => {
    if (!webcamInterruptedRef.current) return;
    if (!webcamCapture.streamActive) return;
    webcamInterruptedRef.current = false;
    if (webcamRecoveryTimerRef.current) {
      clearTimeout(webcamRecoveryTimerRef.current);
      webcamRecoveryTimerRef.current = null;
    }
    if (webcamCountdownIntervalRef.current) {
      clearInterval(webcamCountdownIntervalRef.current);
      webcamCountdownIntervalRef.current = null;
    }
    setWebcamRecoveryCountdown(null);
    recordExamEvent(contestId, "webcam_restored", {
      source: "anticheat:webcam_capture",
      metadata: {
        reason: "stream_recovered",
        module: "webcam",
        module_role: webcamModuleRole,
      },
    }).catch(() => null);
  }, [contestId, webcamCapture.streamActive, webcamModuleRole]);

  useEffect(() => {
    if (!runtimeReauth.inProgress) {
      hasTriggeredScreenShareTimeoutSubmitRef.current = false;
      return;
    }
    if (
      runtimeReauth.remainingSeconds === 0 &&
      !hasTriggeredScreenShareTimeoutSubmitRef.current &&
      !isSubmittingFromScreenShareLoss
    ) {
      hasTriggeredScreenShareTimeoutSubmitRef.current = true;
      void handleForceSubmitFromScreenShareLoss();
    }
  }, [
    handleForceSubmitFromScreenShareLoss,
    isSubmittingFromScreenShareLoss,
    runtimeReauth.inProgress,
    runtimeReauth.remainingSeconds,
  ]);

  useEffect(() => {
    if (examStatus === "submitted" || !effectiveMonitoringEnabled) {
      clearRuntimeScreenShareReauth(contestId);
    }
  }, [contestId, examStatus, effectiveMonitoringEnabled]);

  useEffect(() => {
    if (!hasEnded) return;
    forceStopCapture("contest_ended");
    forceStopWebcamCapture();
  }, [forceStopCapture, forceStopWebcamCapture, hasEnded]);

  useExamHeartbeat(contestId, effectiveMonitoringEnabled);

  useEffect(() => {
    if (contestId) {
      syncAnticheatPhaseWithExamStatus(contestId, examStatus);
    }
  }, [contestId, examStatus]);

  useEffect(() => {
    if (initialFullscreenCheckDone.current || !cheatDetectionEnabled) return;
    if (runtimeReauthActive) return;

    if (effectiveRequiresFullscreen && !fullscreenAdapterRef.current.isActive()) {
      const timer = setTimeout(() => {
        if (!fullscreenAdapterRef.current.isActive() && !isSubmittingFromFullscreenExit) {
          setShowFullscreenExitConfirm(true);
        }
        initialFullscreenCheckDone.current = true;
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      initialFullscreenCheckDone.current = true;
    }
  }, [
    examStatus,
    cheatDetectionEnabled,
    isSubmittingFromFullscreenExit,
    effectiveRequiresFullscreen,
    runtimeReauthActive,
  ]);

  useEffect(() => {
    if (runtimeReauthActive) return;
    if (examStatus === "submitted") {
      if (webcamRecoveryTimerRef.current) {
        clearTimeout(webcamRecoveryTimerRef.current);
        webcamRecoveryTimerRef.current = null;
      }
      if (viewportRecoveryTimerRef.current) {
        clearTimeout(viewportRecoveryTimerRef.current);
        viewportRecoveryTimerRef.current = null;
      }
      viewportInterruptedRef.current = false;
      const stopResult = stopCaptureForContest(contestId, "submitted");
      if (!stopResult) {
        forceStopCapture("submitted");
      }
      forceStopWebcamCapture();
      if (fullscreenAdapterRef.current.isActive()) {
        void fullscreenAdapterRef.current.exit();
      }
    }

    if (
      cheatDetectionEnabled &&
      examStatus === "locked" &&
      effectiveRequiresFullscreen &&
      !fullscreenAdapterRef.current.isActive()
    ) {
      setTimeout(() => {
        if (!fullscreenAdapterRef.current.isActive()) {
          void fullscreenAdapterRef.current.request();
        }
      }, 100);
    }
  }, [
    examStatus,
    cheatDetectionEnabled,
    contestId,
    effectiveRequiresFullscreen,
    forceStopCapture,
    forceStopWebcamCapture,
    runtimeReauthActive,
  ]);

  useEffect(() => {
    const shouldMonitorFullscreen =
      cheatDetectionEnabled && effectiveRequiresFullscreen && examStatus === "locked";

    if (!shouldMonitorFullscreen) return;

    const handleFullscreenExitForLocked = () => {
      if (runtimeReauthActive) return;
      if (!fullscreenAdapterRef.current.isActive() && !isSubmittingFromFullscreenExit) {
        setShowFullscreenExitConfirm(true);
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenExitForLocked);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenExitForLocked);
    };
  }, [
    cheatDetectionEnabled,
    effectiveRequiresFullscreen,
    examStatus,
    isSubmittingFromFullscreenExit,
    runtimeReauthActive,
  ]);

  useEffect(() => {
    if (runtimeReauthActive && showFullscreenExitConfirm) {
      setShowFullscreenExitConfirm(false);
    }
  }, [runtimeReauthActive, showFullscreenExitConfirm]);

  useEffect(() => {
    return () => {
      if (webcamRecoveryTimerRef.current) {
        clearTimeout(webcamRecoveryTimerRef.current);
        webcamRecoveryTimerRef.current = null;
      }
      if (webcamCountdownIntervalRef.current) {
        clearInterval(webcamCountdownIntervalRef.current);
        webcamCountdownIntervalRef.current = null;
      }
      if (viewportRecoveryTimerRef.current) {
        clearTimeout(viewportRecoveryTimerRef.current);
        viewportRecoveryTimerRef.current = null;
      }
      if (viewportCountdownIntervalRef.current) {
        clearInterval(viewportCountdownIntervalRef.current);
        viewportCountdownIntervalRef.current = null;
      }
    };
  }, []);

  const handleFullscreenExitConfirm = async () => {
    setIsSubmittingFromFullscreenExit(true);
    try {
      const success = await submissionProgress.run({
        handlers: {
          recording: async () => {
            await recordExamEventWithForcedCapture(contestId, "exam_submit_initiated", {
              reason: "Exam submitted after fullscreen exit confirmation",
              source: "exam_mode:fullscreen_exit_confirm",
              forceCaptureReason: "exam_submit_initiated:fullscreen_exit_confirm",
              metadata: {
                upload_session_id: getExamCaptureSessionId(contestId) || undefined,
                module: primarySourceModule,
                module_role: "primary",
              },
            }).catch(() => null);
          },
          finalizing: async () => {
            await serviceEndExam(contestId, {
              upload_session_id: getExamCaptureSessionId(contestId) || undefined,
              source_module: primarySourceModule,
            });
            const stopResult = stopCaptureForContest(contestId, "fullscreen_exit_submit");
            if (!stopResult) {
              forceStopCapture("fullscreen_exit_submit");
            }
            forceStopWebcamCapture();
            if (onRefresh) await onRefresh();
          },
        },
      });
      if (success) {
        setShowFullscreenExitConfirm(false);
      } else {
        setShowFullscreenExitConfirm(false);
        if (effectiveRequiresFullscreen) {
          await fullscreenAdapterRef.current.request();
        }
      }
    } catch {
      setShowFullscreenExitConfirm(false);
      if (effectiveRequiresFullscreen) {
        await fullscreenAdapterRef.current.request();
      }
    } finally {
      setIsSubmittingFromFullscreenExit(false);
    }
  };

  const handleFullscreenExitCancel = async () => {
    setShowFullscreenExitConfirm(false);
    if (effectiveRequiresFullscreen) {
      await fullscreenAdapterRef.current.request();
    }
  };

  const handleRecoverFullscreen = useCallback(async () => {
    if (effectiveRequiresFullscreen) {
      await fullscreenAdapterRef.current.request();
    }
  }, [effectiveRequiresFullscreen]);

  const isAnsweringPath = () => {
    const contestBasePath = getContestDashboardPath(contestId);
    const normalizedPath = location.pathname.replace(/\/+$/, "");
    return (
      normalizedPath === `${contestBasePath}/solve` ||
      normalizedPath.startsWith(`${contestBasePath}/solve/`)
    );
  };

  const shouldShowPolicyUnavailableScreen = policyUnavailable && isAnsweringPath();
  const shouldShowLockScreen =
    (examState.isLocked || shouldShowPolicyUnavailableScreen || pwaGuardFailed) &&
    isAnsweringPath();
  const lockReasonText = shouldShowPolicyUnavailableScreen
    ? t("exam.anticheatConfigMissing", "防作弊策略尚未載入，請回到儀表板重新整理後再作答。")
    : pwaGuardFailed
      ? t(
          "exam.pwaRequiredOnTablet",
          "iPad 監考必須以主畫面啟動的 PWA 模式作答，請返回儀表板重新開啟。"
        )
      : examState.lockReason;
  const { unlockTimeLeft } = useContestTimers({
    contest: null,
    contestId,
    refreshContest: onRefresh,
    enableMainCountdown: false,
    autoUnlockAt: shouldShowLockScreen ? examState.autoUnlockAt ?? null : null,
    examStatus: examStatus ?? null,
  });

  const handleBackToContest = async () => {
    await refreshAnticheatConfig();
    navigate(`/contests/${contestId}`);
    if (onRefresh) onRefresh();
  };

  return (
    <ExamCaptureProvider value={capture}>
      <div ref={containerRef} style={{ position: "relative", width: "100%", height: "100%", flex: 1 }}>
        {children}
        <ExamOverlays
          showGracePeriod={false}
          gracePeriodCountdown={0}
          showLockScreen={shouldShowLockScreen}
          lockReason={lockReasonText}
          timeLeft={unlockTimeLeft}
          onBackToContest={handleBackToContest}
        />
        <ExamModals
          showWarning={showWarning}
          pendingApiResponse={pendingApiResponse}
          lastApiResponse={lastApiResponse}
          warningEventType={warningEventType}
          examState={examState}
          warningCountdown={warningCountdown}
          recoveryCountdown={recoveryCountdown}
          recoverySource={recoverySource}
          onRecoverFullscreen={handleRecoverFullscreen}
          onWarningClose={handleWarningClose}
          showUnlockNotification={showUnlockNotification}
          onUnlockContinue={handleUnlockContinue}
          showFullscreenExitConfirm={showFullscreenExitConfirm}
          isSubmittingFromFullscreenExit={isSubmittingFromFullscreenExit}
          onFullscreenExitConfirm={handleFullscreenExitConfirm}
          onFullscreenExitCancel={handleFullscreenExitCancel}
          screenShareRecoveryCountdown={
            runtimeReauth.inProgress ? (runtimeReauth.remainingSeconds ?? 0) : null
          }
          isRequestingScreenShare={isRequestingScreenShare}
          isSubmittingFromScreenShareLoss={isSubmittingFromScreenShareLoss}
          onScreenShareReacquire={handleScreenShareReacquire}
          webcamRecoveryCountdown={webcamRecoveryCountdown}
          isSubmittingFromWebcamLoss={isSubmittingFromWebcamLoss}
          isRequestingWebcam={isRequestingWebcam}
          onWebcamReacquire={handleWebcamReacquire}
          webcamModuleRole={webcamModuleRole}
          viewportRecoveryCountdown={viewportRecoveryCountdown}
          isSubmittingFromViewportLoss={isSubmittingFromViewportLoss}
          isTablet={capability.isTablet}
          showAutoSubmitNotice={showAutoSubmitNotice}
          onAutoSubmitReturnToDashboard={() => {
            setShowAutoSubmitNotice(false);
            navigate(getContestDashboardPath(contestId));
          }}
        />
        <ExamSubmissionProgressModal
          state={submissionProgress.state}
          onRequestClose={submissionProgress.close}
        />
      </div>
    </ExamCaptureProvider>
  );
};

export default ExamModeWrapper;
