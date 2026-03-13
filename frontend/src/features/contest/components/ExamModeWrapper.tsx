import { useCallback, useEffect, useState, useRef } from "react";
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
import { ExamCaptureProvider } from "@/features/contest/contexts/ExamCaptureContext";
import { createStreamAdapter } from "@/features/contest/anticheat/streamAdapter";
import { setRuntimeScreenShareHandoff } from "@/features/contest/anticheat/screenShareHandoffStore";
import {
  applyExamMonitoringPolicyOverrides,
  SCREEN_SHARE_RECOVERY_GRACE_MS,
} from "@/features/contest/domain/examMonitoringPolicy";
import { useContestAnticheatConfig } from "@/features/contest/hooks/useContestAnticheatConfig";
import { useTranslation } from "react-i18next";
import useExamSubmissionProgress from "@/features/contest/hooks/useExamSubmissionProgress";
import ExamSubmissionProgressModal from "@/features/contest/components/exam/ExamSubmissionProgressModal";
import { stopCaptureForContest } from "@/features/contest/anticheat/captureLifecycle";

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
  const streamMonitorEnabled = policyRequired && !policyUnavailable;

  const capture = useAnticheatScreenCapture({
    contestId,
    enabled: captureEnabled,
    monitorStream: streamMonitorEnabled,
    preserveStreamOnUnmount: cheatDetectionEnabled && examStatus !== "submitted" && !hasEnded,
    expectInitialStream: precheckPassed && examStatus === "in_progress",
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

  const [showFullscreenExitConfirm, setShowFullscreenExitConfirm] = useState(false);
  const [isSubmittingFromFullscreenExit, setIsSubmittingFromFullscreenExit] = useState(false);
  const [recoveryCountdown, setRecoveryCountdown] = useState<number | null>(null);
  const [recoverySource, setRecoverySource] = useState<"fullscreen" | "mouse-leave" | null>(null);
  const initialFullscreenCheckDone = useRef(false);

  const [isRequestingScreenShare, setIsRequestingScreenShare] = useState(false);
  const [isSubmittingFromScreenShareLoss, setIsSubmittingFromScreenShareLoss] = useState(false);
  const hasTriggeredScreenShareTimeoutSubmitRef = useRef(false);

  const [showAutoSubmitNotice, setShowAutoSubmitNotice] = useState(false);

  const handleForceSubmitFromScreenShareLoss = useCallback(async () => {
    setIsSubmittingFromScreenShareLoss(true);
    try {
      const success = await submissionProgress.run({
        handlers: {
          recording: async () => {
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
          },
          finalizing: async () => {
            await serviceEndExam(contestId, {
              upload_session_id: getExamCaptureSessionId(contestId) || undefined,
            });
            const stopResult = stopCaptureForContest(contestId, "screen_share_timeout_submit");
            if (!stopResult) {
              forceStopCapture("screen_share_timeout_submit");
            }
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
  }, [contestId, forceStopCapture, onRefresh, submissionProgress]);

  const handleScreenShareLost = useCallback(() => {
    if (examStatus === "submitted") return;
    if (!streamMonitorEnabled) return;
    if (isRuntimeScreenShareReauthActive(contestId)) return;
    const recoveryMs = Math.max(
      1,
      anticheatEffective?.screenShareRecoveryGraceMs ?? SCREEN_SHARE_RECOVERY_GRACE_MS,
    );
    recordExamEvent(contestId, "screen_share_interrupted", {
      source: "anticheat:screen_capture",
      metadata: { reason: "stream_ended" },
    }).catch(() => null);
    beginRuntimeScreenShareReauth(contestId, recoveryMs);
  }, [anticheatEffective?.screenShareRecoveryGraceMs, contestId, examStatus, streamMonitorEnabled]);
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
  }, [forceStopCapture, hasEnded]);

  useExamHeartbeat(contestId, effectiveMonitoringEnabled);

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

  useEffect(() => {
    if (runtimeReauthActive) return;
    if (examStatus === "submitted") {
      const stopResult = stopCaptureForContest(contestId, "submitted");
      if (!stopResult) {
        forceStopCapture("submitted");
      }
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
      const success = await submissionProgress.run({
        handlers: {
          recording: async () => {
            await recordExamEventWithForcedCapture(contestId, "exam_submit_initiated", {
              reason: "Exam submitted after fullscreen exit confirmation",
              source: "exam_mode:fullscreen_exit_confirm",
              forceCaptureReason: "exam_submit_initiated:fullscreen_exit_confirm",
              metadata: {
                upload_session_id: getExamCaptureSessionId(contestId) || undefined,
              },
            }).catch(() => null);
          },
          finalizing: async () => {
            await serviceEndExam(contestId, {
              upload_session_id: getExamCaptureSessionId(contestId) || undefined,
            });
            const stopResult = stopCaptureForContest(contestId, "fullscreen_exit_submit");
            if (!stopResult) {
              forceStopCapture("fullscreen_exit_submit");
            }
            if (onRefresh) await onRefresh();
          },
        },
      });
      if (success) {
        setShowFullscreenExitConfirm(false);
      } else {
        setShowFullscreenExitConfirm(false);
        await fullscreenAdapterRef.current.request();
      }
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
        <ExamSubmissionProgressModal
          state={submissionProgress.state}
          onRequestClose={submissionProgress.close}
        />
      </div>
    </ExamCaptureProvider>
  );
};

export default ExamModeWrapper;
