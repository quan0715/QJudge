import { useCallback, useEffect, useState, useRef } from "react";
import type { ReactNode } from "react";
import type { ExamStatusType } from "@/core/entities/contest.entity";
import { endExam as serviceEndExam } from "@/infrastructure/api/repositories";
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
import { useRuntimeScreenShareReauth } from "@/features/contest/anticheat/runtimeReauthState";
import { hasExamPrecheckPassed } from "@/features/contest/screens/paperExam/hooks";
import { useAnticheatScreenCapture } from "@/features/contest/screens/paperExam/hooks/useAnticheatScreenCapture";
import { ExamCaptureProvider } from "@/features/contest/contexts/ExamCaptureContext";
import { recordExamEvent } from "@/infrastructure/api/repositories";

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
  const runtimeReauthActive = useRuntimeScreenShareReauth();
  const { showToast } = useToast();

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
    isExamMonitored,
    lockReason,
    isBypassed: false,
    onRefresh,
    requestFullscreen: fullscreenAdapterRef.current.request,
  });

  // 2. Monitoring Hook — keep running in locked/paused so violations are still recorded
  const precheckPassed = contestId ? hasExamPrecheckPassed(contestId) : false;
  const captureEnabled = isExamMonitored && precheckPassed && examStatus !== "submitted";
  const hasSentDegradedRef = useRef(false);
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
  const capture = useAnticheatScreenCapture({
    contestId,
    enabled: captureEnabled,
    reportDegraded,
  });
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

  useExamMonitoring({
    enabled: isExamMonitored,
    onViolation: handleViolation,
    onBlockedAction: handleBlockedAction,
    onRecoveryCountdownChange: (secondsLeft, source) => {
      setRecoveryCountdown(secondsLeft);
      setRecoverySource(secondsLeft != null ? source : null);
    },
  });

  useExamHeartbeat(contestId, isExamMonitored && examStatus !== "submitted");

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
  }, [examStatus, cheatDetectionEnabled, isSubmittingFromFullscreenExit, runtimeReauthActive]);

  // Fullscreen transition flows for submit / locked states
  useEffect(() => {
    if (runtimeReauthActive) return;
    if (examStatus === "submitted") {
      capture.forceStopCapture();
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
  }, [examStatus, cheatDetectionEnabled, runtimeReauthActive]);

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
      capture.forceStopCapture();
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
  const shouldShowLockScreen = examState.isLocked && isAnsweringPath();
  const { unlockTimeLeft } = useContestTimers({
    contest: null,
    contestId,
    refreshContest: onRefresh,
    enableMainCountdown: false,
    autoUnlockAt: shouldShowLockScreen ? examState.autoUnlockAt ?? null : null,
    examStatus: examStatus ?? null,
  });

  const handleBackToContest = async () => {
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
          lockReason={examState.lockReason}
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
        />
      </div>
    </ExamCaptureProvider>
  );
};

export default ExamModeWrapper;
