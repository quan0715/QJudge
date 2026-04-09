import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import type { ReactNode } from "react";
import type { ExamStatusType } from "@/core/entities/contest.entity";
import { endExam as serviceEndExam, recordExamEvent } from "@/infrastructure/api/repositories";
import { getExamCaptureSessionId } from "@/shared/state/examCaptureSessionStore";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { ExamOverlays } from "@/features/contest/components/exam/ExamOverlays";
import { ExamModals } from "@/features/contest/components/exam/ExamModals";
import { useContestTimers } from "@/features/contest/hooks/useContestTimers";
import { useExamState } from "@/features/contest/hooks/useExamState";
import { useExamMonitoring } from "@/features/contest/hooks/useExamMonitoring";
import { useExamHeartbeat } from "@/features/contest/hooks/useExamHeartbeat";
import {
  getClassroomContestDashboardPath,
} from "@/features/contest/domain/contestRoutePolicy";
import { useToast } from "@/shared/contexts/ToastContext";
import { createFullscreenAdapter } from "@/features/contest/anticheat/fullscreenAdapter";
import { syncAnticheatPhaseWithExamStatus, resetAnticheatOrchestrator } from "@/features/contest/anticheat/orchestrator";
import { recordExamEventWithForcedCapture } from "@/features/contest/anticheat/forcedCapture";
import { hasExamPrecheckPassed } from "@/features/contest/screens/paperExam/hooks";
import { useAnticheatScreenCapture } from "@/features/contest/screens/paperExam/hooks/useAnticheatScreenCapture";
import { useAnticheatWebcamCapture } from "@/features/contest/screens/paperExam/hooks/useAnticheatWebcamCapture";
import { ExamCaptureProvider } from "@/features/contest/contexts/ExamCaptureContext";
import { createStreamAdapter } from "@/features/contest/anticheat/streamAdapter";
import {
  setRuntimeScreenShareHandoff,
  clearPrecheckScreenShareHandoff,
  clearRuntimeScreenShareHandoff,
} from "@/features/contest/anticheat/screenShareHandoffStore";
import { setRuntimeWebcamHandoff } from "@/features/contest/anticheat/webcamHandoffStore";
import { requestUserMediaVideo, supportsUserMediaApi } from "@/features/contest/anticheat/mediaApi";
import { isStreamHealthy } from "@/features/contest/anticheat/mediaStreamHealth";
import {
  applyExamMonitoringPolicyOverrides,
} from "@/features/contest/domain/examMonitoringPolicy";
import { useContestAnticheatConfig } from "@/features/contest/hooks/useContestAnticheatConfig";
import { useTranslation } from "react-i18next";
import ExamSubmissionProgressModal from "@/features/contest/components/exam/ExamSubmissionProgressModal";
import { stopCaptureForContest } from "@/features/contest/anticheat/captureLifecycle";
import {
  detectAnticheatCapability,
  resolveDeviceMonitoringPlan,
} from "@/features/contest/domain/anticheatModulePolicy";
import { useForceSubmitArbiter } from "@/features/contest/hooks/useForceSubmitArbiter";
import { useViewportMonitoring } from "@/features/contest/hooks/useViewportMonitoring";
import { useWebcamMonitoring } from "@/features/contest/hooks/useWebcamMonitoring";
import { useScreenShareMonitoring } from "@/features/contest/hooks/useScreenShareMonitoring";
import { useFullscreenMonitoring } from "@/features/contest/hooks/useFullscreenMonitoring";
import { useMouseLeaveMonitoring } from "@/features/contest/hooks/useMouseLeaveMonitoring";
import { useFocusMonitoring } from "@/features/contest/hooks/useFocusMonitoring";
import { useMultiDisplayMonitoring } from "@/features/contest/hooks/useMultiDisplayMonitoring";
import { selectPrimaryCountdownFromRegistry } from "@/features/contest/domain/violationRoutes";

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
  const { classroomId } = useParams<{ classroomId?: string }>();
  const containerRef = useRef<HTMLDivElement>(null);
  const lastBlockedActionToastAt = useRef<number>(0);
  const fullscreenAdapterRef = useRef(createFullscreenAdapter());
  const { showToast } = useToast();
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
      webcamRecoveryGraceMs: anticheatEffective.webcamRecoveryGraceMs,
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
  const streamMonitorEnabled = effectiveMonitoringEnabled;
  const screenStreamMonitorEnabled = streamMonitorEnabled && monitoringPlan.runtime.monitorScreenShareStream;
  const webcamStreamMonitorEnabled = streamMonitorEnabled && monitoringPlan.runtime.monitorWebcamStream;
  const lockedFullscreenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // When config refreshes and screen share is no longer required, discard any
  // lingering precheck/runtime handoff streams so they don't trigger "螢幕分享已中斷"
  // the next time the stream lifecycle runs.
  useEffect(() => {
    if (!monitoringPlan.runtime.monitorScreenShareStream) {
      clearPrecheckScreenShareHandoff(true);
      clearRuntimeScreenShareHandoff(true);
    }
  }, [monitoringPlan.runtime.monitorScreenShareStream]);

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
    onScreenShareLost: () => { screenShare.onStreamLost(); },
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
    onWebcamLost: () => { webcam.onStreamLost(); },
  });
  const { forceStopCapture } = capture;
  const { forceStopCapture: forceStopWebcamCapture } = webcamCapture;
  const captureBeforeSubmit = useCallback(async () => {
    await Promise.allSettled([
      capture.forceCaptureNow("exam_submit_initiated:screen_share_pre_submit", {
        eventType: "exam_submit_initiated",
      }),
      webcamCapture.forceCaptureNow("exam_submit_initiated:webcam_pre_submit"),
    ]);
    await Promise.allSettled([
      capture.flushPendingUploads(),
      webcamCapture.flushPendingUploads(),
    ]);
  }, [capture, webcamCapture]);
  const examCaptureContextValue = useMemo(
    () => ({
      ...capture,
      flushPendingUploads: async () => {
        await captureBeforeSubmit();
      },
    }),
    [capture, captureBeforeSubmit],
  );

  // --- Force-submit arbiter (single entry point for all timeout-triggered submissions) ---
  const { requestForceSubmit, isForceSubmitting, submissionProgress } = useForceSubmitArbiter({
    contestId,
    forceStopCapture,
    forceStopWebcamCapture,
    beforeSubmitCapture: captureBeforeSubmit,
    onRefresh,
    onSuccess: () => setShowAutoSubmitNotice(true),
  });

  // --- Domain monitoring hooks ---
  const screenShare = useScreenShareMonitoring({
    contestId,
    enabled: screenStreamMonitorEnabled,
    examSubmitted: examStatus === "submitted",
    monitoringDisabled: !effectiveMonitoringEnabled,
    moduleRole: screenModuleRole,
    recoveryGraceMs: anticheatEffective?.screenShareRecoveryGraceMs,
    requestForceSubmit,
  });

  const webcam = useWebcamMonitoring({
    contestId,
    enabled: webcamStreamMonitorEnabled,
    examSubmitted: examStatus === "submitted",
    isPrimary: webcamModuleRole === "primary",
    moduleRole: webcamModuleRole,
    recoveryGraceMs: anticheatEffective?.webcamRecoveryGraceMs,
    streamActive: webcamCapture.streamActive,
    requestForceSubmit,
  });

  const viewport = useViewportMonitoring({
    contestId,
    enabled: viewportMonitorEnabled,
    examSubmitted: examStatus === "submitted",
    recoveryGraceMs: anticheatEffective?.monitoringRecoveryGraceMs,
    isTablet: capability.isTablet,
    primarySourceModule,
    requestForceSubmit,
  });

  const fullscreen = useFullscreenMonitoring({
    contestId,
    enabled: effectiveMonitoringEnabled && effectiveRequiresFullscreen && monitoringPlan.detectors.fullscreen,
    examSubmitted: examStatus === "submitted",
    recoveryGraceMs: anticheatEffective?.monitoringRecoveryGraceMs,
    onViolation: handleViolation,
    requestForceSubmit,
  });

  const mouseLeave = useMouseLeaveMonitoring({
    contestId,
    enabled: effectiveMonitoringEnabled && monitoringPlan.detectors.mouseLeave,
    isTablet: capability.isTablet,
    examSubmitted: examStatus === "submitted",
    recoveryGraceMs: anticheatEffective?.monitoringRecoveryGraceMs,
    cooldownMs: anticheatEffective?.mouseLeaveCooldownMs,
    onViolation: handleViolation,
    requestForceSubmit,
  });

  const multiDisplay = useMultiDisplayMonitoring({
    contestId,
    enabled: effectiveMonitoringEnabled && monitoringPlan.detectors.multiDisplay,
    examSubmitted: examStatus === "submitted",
    recoveryGraceMs: anticheatEffective?.monitoringRecoveryGraceMs,
    onViolation: handleViolation,
    requestForceSubmit,
  });

  const focus = useFocusMonitoring({
    contestId,
    enabled: effectiveMonitoringEnabled && (monitoringPlan.detectors.focus || monitoringPlan.detectors.tabVisibility),
    examSubmitted: examStatus === "submitted",
    enableFocus: monitoringPlan.detectors.focus,
    enableTabVisibility: monitoringPlan.detectors.tabVisibility,
    recoveryGraceMs: anticheatEffective?.monitoringRecoveryGraceMs,
    onViolation: handleViolation,
    requestForceSubmit,
    onInteraction: multiDisplay.triggerCheck,
  });

  const runtimeReauthActive = screenShare.reauth.active;

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
  const initialFullscreenCheckDone = useRef(false);

  const countdownMap = useMemo(() => {
    const m = new Map<string, number | null>();
    m.set("screen_share", screenShare.reauth.inProgress ? (screenShare.reauth.remainingSeconds ?? 0) : null);
    m.set("webcam", webcam.recoveryCountdown);
    m.set("viewport", viewport.recoveryCountdown);
    m.set("fullscreen", fullscreen.recoveryCountdown);
    m.set("mouse_leave", mouseLeave.recoveryCountdown);
    m.set("tab_hidden", focus.tabHiddenCountdown);
    m.set("window_blur", focus.windowBlurCountdown);
    m.set("multiple_displays", multiDisplay.recoveryCountdown);
    return m;
  }, [screenShare.reauth, webcam.recoveryCountdown, viewport.recoveryCountdown, fullscreen.recoveryCountdown, mouseLeave.recoveryCountdown, focus.tabHiddenCountdown, focus.windowBlurCountdown, multiDisplay.recoveryCountdown]);
  const primaryCountdown = selectPrimaryCountdownFromRegistry(countdownMap);

  const [isRequestingScreenShare, setIsRequestingScreenShare] = useState(false);
  const [isRequestingWebcam, setIsRequestingWebcam] = useState(false);

  const [showAutoSubmitNotice, setShowAutoSubmitNotice] = useState(false);

  const handleScreenShareReacquire = useCallback(async () => {
    setIsRequestingScreenShare(true);
    try {
      const stream = await streamAdapterRef.current.acquireMonitorStream();
      if (stream) {
        setRuntimeScreenShareHandoff(stream);
        screenShare.onStreamRestored();
        if (effectiveRequiresFullscreen && !fullscreenAdapterRef.current.isActive()) {
          void fullscreenAdapterRef.current.request();
        }
      }
    } finally {
      setIsRequestingScreenShare(false);
    }
  }, [contestId, effectiveRequiresFullscreen, screenShare]);

  const handleWebcamReacquire = useCallback(async () => {
    if (!supportsUserMediaApi()) return;
    setIsRequestingWebcam(true);
    try {
      const stream = await requestUserMediaVideo();
      if (!isStreamHealthy(stream)) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      setRuntimeWebcamHandoff(stream);
      webcam.onStreamRestored("user_reauthorized");
    } catch {
      // user denied or error — do nothing, countdown continues
    } finally {
      setIsRequestingWebcam(false);
    }
  }, [contestId, webcam]);

  useExamMonitoring({
    contestId,
    enabled: effectiveMonitoringEnabled,
    onViolation: handleViolation,
    onBlockedAction: handleBlockedAction,
  });

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
    return () => {
      resetAnticheatOrchestrator(contestId);
    };
  }, [contestId]);

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
      if (lockedFullscreenTimerRef.current) {
        clearTimeout(lockedFullscreenTimerRef.current);
      }
      lockedFullscreenTimerRef.current = setTimeout(() => {
        lockedFullscreenTimerRef.current = null;
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
      if (lockedFullscreenTimerRef.current) {
        clearTimeout(lockedFullscreenTimerRef.current);
        lockedFullscreenTimerRef.current = null;
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
              captureOptions: {
                eventType: "exam_submit_initiated",
                modules: [primarySourceModule],
              },
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
    const contestBasePath = classroomId
      ? getClassroomContestDashboardPath(classroomId, contestId)
      : null;
    if (!contestBasePath) return false;
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
    if (!classroomId) return;
    navigate(getClassroomContestDashboardPath(classroomId, contestId));
    if (onRefresh) onRefresh();
  };

  return (
    <ExamCaptureProvider value={examCaptureContextValue}>
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
          recoveryCountdown={
            primaryCountdown.source === "fullscreen" ||
            primaryCountdown.source === "mouse_leave" ||
            primaryCountdown.source === "tab_hidden" ||
            primaryCountdown.source === "window_blur" ||
            primaryCountdown.source === "multiple_displays"
              ? primaryCountdown.value
              : null
          }
          recoverySource={primaryCountdown.source}
          onRecoverFullscreen={handleRecoverFullscreen}
          onWarningClose={handleWarningClose}
          showUnlockNotification={showUnlockNotification}
          onUnlockContinue={handleUnlockContinue}
          showFullscreenExitConfirm={showFullscreenExitConfirm}
          isSubmittingFromFullscreenExit={isSubmittingFromFullscreenExit}
          onFullscreenExitConfirm={handleFullscreenExitConfirm}
          onFullscreenExitCancel={handleFullscreenExitCancel}
          screenShareRecoveryCountdown={
            screenShare.reauth.inProgress ? (screenShare.reauth.remainingSeconds ?? 0) : null
          }
          isRequestingScreenShare={isRequestingScreenShare}
          isSubmittingFromScreenShareLoss={isForceSubmitting}
          onScreenShareReacquire={handleScreenShareReacquire}
          webcamRecoveryCountdown={webcam.recoveryCountdown}
          isSubmittingFromWebcamLoss={isForceSubmitting}
          isRequestingWebcam={isRequestingWebcam}
          onWebcamReacquire={handleWebcamReacquire}
          webcamModuleRole={webcamModuleRole}
          viewportRecoveryCountdown={viewport.recoveryCountdown}
          isSubmittingFromViewportLoss={isForceSubmitting}
          isTablet={capability.isTablet}
          showAutoSubmitNotice={showAutoSubmitNotice}
          onAutoSubmitReturnToDashboard={() => {
            setShowAutoSubmitNotice(false);
            if (classroomId) {
              navigate(getClassroomContestDashboardPath(classroomId, contestId));
            }
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
