import { useCallback, useEffect, useState, useRef } from "react";
import type { ReactNode } from "react";
import type { ExamStatusType } from "@/core/entities/contest.entity";
import { endExam as serviceEndExam } from "@/infrastructure/api/repositories";
import { useNavigate, useLocation } from "react-router-dom";
import { ExamOverlays } from "@/features/contest/components/exam/ExamOverlays";
import { ExamModals } from "@/features/contest/components/exam/ExamModals";
import { useContestTimers } from "@/features/contest/hooks/useContestTimers";
import { useExamState } from "@/features/contest/hooks/useExamState";
import { useExamMonitoring } from "@/features/contest/hooks/useExamMonitoring";
import { getContestDashboardPath } from "@/features/contest/domain/contestRoutePolicy";
import { useToast } from "@/shared/contexts/ToastContext";
import {
  exitFullscreen,
  isFullscreen,
  requestFullscreen,
} from "@/core/usecases/exam";

interface ExamModeWrapperProps {
  contestId: string;
  cheatDetectionEnabled: boolean;
  lockReason?: string;
  examStatus?: ExamStatusType;
  onRefresh?: () => Promise<void>;
  children: ReactNode;
}

const ExamModeWrapper: React.FC<ExamModeWrapperProps> = ({
  contestId,
  cheatDetectionEnabled,
    lockReason,
    examStatus,
    onRefresh,
    children,
  }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const containerRef = useRef<HTMLDivElement>(null);
  const lastBlockedActionToastAt = useRef<number>(0);
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
    lockReason,
    isBypassed: false,
    onRefresh,
    requestFullscreen,
  });

  // 2. Monitoring Hook
  const isCurrentlyActive = examStatus === "in_progress";
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
  const [fullscreenRecoveryCountdown, setFullscreenRecoveryCountdown] = useState<number | null>(null);
  const initialFullscreenCheckDone = useRef(false);

  useExamMonitoring({
    enabled: cheatDetectionEnabled && isCurrentlyActive,
    onViolation: handleViolation,
    onBlockedAction: handleBlockedAction,
    onFullscreenRecoveryCountdownChange: setFullscreenRecoveryCountdown,
  });

  // Initial check: if exam is active but not in fullscreen after page load, show confirmation
  useEffect(() => {
    if (initialFullscreenCheckDone.current || !cheatDetectionEnabled) return;

    const shouldBeInFullscreen =
      examStatus === "in_progress" || examStatus === "locked";

    if (shouldBeInFullscreen && !isFullscreen()) {
      const timer = setTimeout(() => {
        if (!isFullscreen() && !isSubmittingFromFullscreenExit) {
          setShowFullscreenExitConfirm(true);
        }
        initialFullscreenCheckDone.current = true;
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      initialFullscreenCheckDone.current = true;
    }
  }, [examStatus, cheatDetectionEnabled, isSubmittingFromFullscreenExit]);

  // Fullscreen transition flows for submit / locked states
  useEffect(() => {
    if (examStatus === "submitted") {
      if (isFullscreen()) {
        exitFullscreen().catch((e) => {
          console.warn("Failed to exit fullscreen on submit:", e);
        });
      }
    }

    if (
      cheatDetectionEnabled &&
      examStatus === "locked" &&
      !isFullscreen()
    ) {
      setTimeout(() => {
        if (!isFullscreen()) {
          requestFullscreen().catch((e) => {
            console.warn("[Exam] Failed to enter fullscreen for locked state:", e);
          });
        }
      }, 100);
    }
  }, [examStatus, cheatDetectionEnabled]);

  // Monitor fullscreen exit for locked states - show submit confirmation
  useEffect(() => {
    const shouldMonitorFullscreen =
      cheatDetectionEnabled && examStatus === "locked";

    if (!shouldMonitorFullscreen) return;

    const handleFullscreenExitForLocked = () => {
      if (!isFullscreen() && !isSubmittingFromFullscreenExit) {
        setShowFullscreenExitConfirm(true);
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenExitForLocked);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenExitForLocked);
    };
  }, [cheatDetectionEnabled, examStatus, isSubmittingFromFullscreenExit]);

  const handleFullscreenExitConfirm = async () => {
    setIsSubmittingFromFullscreenExit(true);
    try {
      await serviceEndExam(contestId);
      if (onRefresh) await onRefresh();
      setShowFullscreenExitConfirm(false);
    } catch (error) {
      console.error("Failed to submit exam:", error);
      setShowFullscreenExitConfirm(false);
      try {
        await requestFullscreen();
      } catch (e) {
        console.error("Failed to re-enter fullscreen:", e);
      }
    } finally {
      setIsSubmittingFromFullscreenExit(false);
    }
  };

  const handleFullscreenExitCancel = async () => {
    setShowFullscreenExitConfirm(false);
    try {
      await requestFullscreen();
    } catch (error) {
      console.error("Failed to re-enter fullscreen:", error);
    }
  };

  const handleRecoverFullscreen = useCallback(async () => {
    try {
      await requestFullscreen();
    } catch (error) {
      console.error("Failed to recover fullscreen:", error);
    }
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
        fullscreenRecoveryCountdown={fullscreenRecoveryCountdown}
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
  );
};

export default ExamModeWrapper;
