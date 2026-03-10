import { useCallback, useEffect, useState, useRef } from "react";
import type { ReactNode } from "react";
import type { ExamStatusType } from "@/core/entities/contest.entity";
import { endExam as serviceEndExam, recordExamEvent } from "@/infrastructure/api/repositories";
import { getExamCaptureSessionId } from "@/features/contest/screens/paperExam/hooks/examCaptureSession";
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
import { ExamCaptureProvider } from "@/features/contest/contexts/ExamCaptureContext";
import { createStreamAdapter } from "@/features/contest/anticheat/streamAdapter";
import { setRuntimeScreenShareHandoff } from "@/features/contest/screens/paperExam/hooks/examScreenShareHandoff";
import {
  applyExamMonitoringPolicyOverrides,
} from "@/features/contest/domain/examMonitoringPolicy";
import { useContestAnticheatConfig } from "@/features/contest/hooks/useContestAnticheatConfig";
import { useTranslation } from "react-i18next";

interface ExamModeWrapperProps {
  contestId: string;
  cheatDetectionEnabled: boolean;
  isExamMonitored: boolean;
  requiresFullscreen: boolean;
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
  const streamAdapterRef = useRef(createStreamAdapter());
  const { t } = useTranslation("contest");
  const {
    config: anticheatConfig,
    loading: anticheatConfigLoading,
    refresh: refreshAnticheatConfig,
  } = useContestAnticheatConfig(contestId);
  const anticheatEffective = anticheatConfig?.effective;
  const policyRequired = cheatDetectionEnabled && (isExamMonitored || isMonitoredStatus(examStatus));
  const policyUnavailable = policyRequired && !anticheatConfigLoading && !anticheatConfig;
  const effectiveMonitoringEnabled = policyRequired && !!anticheatEffective && !policyUnavailable;

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

  // 1. Core State & API actions
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

  // 2. Monitoring Hook — keep running in locked/paused so violations are still recorded
  const precheckPassed = contestId ? hasExamPrecheckPassed(contestId) : false;
  const captureEnabled = effectiveMonitoringEnabled && precheckPassed;
  const hasSentDegradedRef = useRef(false);
  const onScreenShareLostRef = useRef<(() => void) | undefined>(undefined);
  const reportDegraded = useCallback((isDegraded: boolean) => {
    if (!isDegraded) {
      hasSentDegradedRef.current = false;
      return;
    }
    if (hasSentDegradedRef.current) return;
    hasSentDegradedRef.current = true;
    recordExamEvent(contestId, "capture_upload_degraded", {
      reason: "Upload retries exhausted",
      source: "exam_mode:capture_degraded",
      metadata: { upload_session_id: getExamCaptureSessionId(contestId) || undefined },
    }).catch(() => {});
  }, [contestId]);
  // monitorStream: keeps stream alive + detects loss on ALL pages (dashboard & answering).
  // enabled (captureEnabled): additionally runs capture interval + upload on answering pages.
  const streamMonitorEnabled = effectiveMonitoringEnabled;

  const capture = useAnticheatScreenCapture({
    contestId,
    enabled: captureEnabled,
    monitorStream: streamMonitorEnabled,
    intervalMs: anticheatEffective ? Math.max(1, anticheatEffective.captureIntervalSeconds) * 1000 : undefined,
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
  const { forceStopCapture } = capture;
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

  // 3. UI Status Management (Fullscreen modals & exit flows)
  const [showFullscreenExitConfirm, setShowFullscreenExitConfirm] = useState(false);
  const [isSubmittingFromFullscreenExit, setIsSubmittingFromFullscreenExit] = useState(false);
  const [recoveryCountdown, setRecoveryCountdown] = useState<number | null>(null);
  const [recoverySource, setRecoverySource] = useState<"fullscreen" | "mouse-leave" | null>(null);
  const initialFullscreenCheckDone = useRef(false);

  // Screen share recovery state
  const [isRequestingScreenShare, setIsRequestingScreenShare] = useState(false);
  const [isSubmittingFromScreenShareLoss, setIsSubmittingFromScreenShareLoss] = useState(false);
  const hasTriggeredScreenShareTimeoutSubmitRef = useRef(false);

  // Auto-submit notification (shown after force submit due to screen share loss)
  const [showAutoSubmitNotice, setShowAutoSubmitNotice] = useState(false);

  const handleForceSubmitFromScreenShareLoss = useCallback(async () => {
    setIsSubmittingFromScreenShareLoss(true);
    try {
      // Record P0 event only now that recovery grace period has expired
      await recordExamEvent(contestId, "screen_share_stopped", {
        source: "anticheat:screen_capture",
        metadata: { reason: "recovery_timeout" },
      }).catch(() => null);
      await recordExamEventWithForcedCapture(contestId, "exam_submit_initiated", {
        reason: "Force submit after screen share recovery timeout",
        source: "exam_mode:screen_share_recovery_timeout",
        forceCaptureReason: "exam_submit_initiated:screen_share_timeout",
        metadata: {
          upload_session_id: getExamCaptureSessionId(contestId) || undefined,
        },
      }).catch(() => null);
      await serviceEndExam(contestId, {
        upload_session_id: getExamCaptureSessionId(contestId) || undefined,
      });
      forceStopCapture();
      if (onRefresh) await onRefresh();
      setShowAutoSubmitNotice(true);
    } catch {
      // Best-effort submit
    } finally {
      setIsSubmittingFromScreenShareLoss(false);
      endRuntimeScreenShareReauth(contestId, 0);
    }
  }, [contestId, forceStopCapture, onRefresh]);

  const handleScreenShareLost = useCallback(() => {
    if (examStatus === "submitted") return;
    if (!anticheatEffective) return;
    // Guard: don't fire twice if both callback and streamActive fallback trigger
    if (isRuntimeScreenShareReauthActive(contestId)) return;
    // Record P2 informational event — the user still has a recovery window.
    // P0 screen_share_stopped is only recorded if recovery times out.
    recordExamEvent(contestId, "screen_share_interrupted", {
      source: "anticheat:screen_capture",
      metadata: { reason: "stream_ended" },
    }).catch(() => null);
    beginRuntimeScreenShareReauth(contestId, Math.max(1, anticheatEffective.screenShareRecoveryGraceMs));
  }, [anticheatEffective, contestId, examStatus]);
  onScreenShareLostRef.current = handleScreenShareLost;

  const handleScreenShareReacquire = useCallback(async () => {
    setIsRequestingScreenShare(true);
    try {
      const stream = await streamAdapterRef.current.acquireMonitorStream();
      if (stream) {
        setRuntimeScreenShareHandoff(stream);
        endRuntimeScreenShareReauth(contestId);
        recordExamEvent(contestId, "screen_share_restored", {
          source: "anticheat:screen_capture",
          metadata: { reason: "user_reshared" },
        }).catch(() => null);
        // Keep screen-share recovery independent from fullscreen recovery.
        // If fullscreen re-entry fails, existing fullscreen detectors/modals
        // will handle it separately without forcing screen-share timeout submit.
        if (requiresFullscreen && !fullscreenAdapterRef.current.isActive()) {
          void fullscreenAdapterRef.current.request();
        }
      }
    } finally {
      setIsRequestingScreenShare(false);
    }
  }, [contestId, requiresFullscreen]);

  const handleTraceEvent = useCallback((eventType: string, reason: string) => {
    recordExamEvent(contestId, eventType, {
      source: "anticheat:trace",
      metadata: { reason },
    }).catch(() => null);
  }, [contestId]);

  useExamMonitoring({
    contestId,
    enabled: effectiveMonitoringEnabled,
    onViolation: handleViolation,
    onBlockedAction: handleBlockedAction,
    onRecoveryCountdownChange: (secondsLeft, source) => {
      // Suppress fullscreen/mouse-leave recovery when screen share reauth is
      // active — screen share loss already covers this scenario and showing
      // both modals simultaneously confuses the user.
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

  // Dismiss fullscreen/mouse-leave recovery modal when screen share reauth
  // starts (e.g. both fire nearly simultaneously when screen share stops).
  useEffect(() => {
    if (runtimeReauthActive && recoveryCountdown != null) {
      setRecoveryCountdown(null);
      setRecoverySource(null);
    }
  }, [runtimeReauthActive, recoveryCountdown]);

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

  useExamHeartbeat(contestId, effectiveMonitoringEnabled);

  // Initial check: if exam is active but not in fullscreen after page load, show confirmation
  useEffect(() => {
    if (contestId) {
      syncAnticheatPhaseWithExamStatus(contestId, examStatus);
    }
  }, [contestId, examStatus]);

  useEffect(() => {
    if (initialFullscreenCheckDone.current || !cheatDetectionEnabled) return;
    if (runtimeReauthActive) return;

    if (requiresFullscreen && !fullscreenAdapterRef.current.isActive()) {
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
    requiresFullscreen,
    runtimeReauthActive,
  ]);

  // Fullscreen transition flows for submit / locked states
  useEffect(() => {
    if (runtimeReauthActive) return;
    if (examStatus === "submitted") {
      forceStopCapture();
      if (fullscreenAdapterRef.current.isActive()) {
        void fullscreenAdapterRef.current.exit();
      }
    }

    if (
      cheatDetectionEnabled &&
      examStatus === "locked" &&
      !fullscreenAdapterRef.current.isActive()
    ) {
      setTimeout(() => {
        if (!fullscreenAdapterRef.current.isActive()) {
          void fullscreenAdapterRef.current.request();
        }
      }, 100);
    }
  }, [examStatus, cheatDetectionEnabled, forceStopCapture, runtimeReauthActive]);

  // Monitor fullscreen exit for locked states - show submit confirmation
  useEffect(() => {
    const shouldMonitorFullscreen =
      cheatDetectionEnabled && examStatus === "locked";

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
  }, [cheatDetectionEnabled, examStatus, isSubmittingFromFullscreenExit, runtimeReauthActive]);

  useEffect(() => {
    if (runtimeReauthActive && showFullscreenExitConfirm) {
      setShowFullscreenExitConfirm(false);
    }
  }, [runtimeReauthActive, showFullscreenExitConfirm]);

  const handleFullscreenExitConfirm = async () => {
    setIsSubmittingFromFullscreenExit(true);
    try {
      await recordExamEventWithForcedCapture(contestId, "exam_submit_initiated", {
        reason: "Exam submitted after fullscreen exit confirmation",
        source: "exam_mode:fullscreen_exit_confirm",
        forceCaptureReason: "exam_submit_initiated:fullscreen_exit_confirm",
        metadata: {
          upload_session_id: getExamCaptureSessionId(contestId) || undefined,
        },
      }).catch(() => null);
      await serviceEndExam(contestId, {
        upload_session_id: getExamCaptureSessionId(contestId) || undefined,
      });
      forceStopCapture();
      if (onRefresh) await onRefresh();
      setShowFullscreenExitConfirm(false);
    } catch {
      setShowFullscreenExitConfirm(false);
      await fullscreenAdapterRef.current.request();
    } finally {
      setIsSubmittingFromFullscreenExit(false);
    }
  };

  const handleFullscreenExitCancel = async () => {
    setShowFullscreenExitConfirm(false);
    await fullscreenAdapterRef.current.request();
  };

  const handleRecoverFullscreen = useCallback(async () => {
    await fullscreenAdapterRef.current.request();
  }, []);

  const isAnsweringPath = () => {
    const contestBasePath = getContestDashboardPath(contestId);
    const normalizedPath = location.pathname.replace(/\/+$/, "");
    return (
      normalizedPath.startsWith(`${contestBasePath}/solve/`) ||
      normalizedPath.startsWith(`${contestBasePath}/paper-exam/answering`)
    );
  };

  // Locked state should always block answering views.
  const shouldShowPolicyUnavailableScreen = policyUnavailable && isAnsweringPath();
  const shouldShowLockScreen = (examState.isLocked || shouldShowPolicyUnavailableScreen) && isAnsweringPath();
  const lockReasonText = shouldShowPolicyUnavailableScreen
    ? t("exam.anticheatConfigMissing", "防作弊策略尚未載入，請回到儀表板重新整理後再作答。")
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
          showAutoSubmitNotice={showAutoSubmitNotice}
          onAutoSubmitReturnToDashboard={() => {
            setShowAutoSubmitNotice(false);
            navigate(getContestDashboardPath(contestId));
          }}
        />
      </div>
    </ExamCaptureProvider>
  );
};

export default ExamModeWrapper;
