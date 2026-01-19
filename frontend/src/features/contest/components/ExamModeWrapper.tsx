import { useEffect, useState, useRef } from "react";
import type { ReactNode } from "react";
import type {
  ExamModeState,
  ExamStatusType,
} from "@/core/entities/contest.entity";
import type { UserRole } from "@/core/entities/user.entity";
import { endExam as serviceEndExam, recordExamEvent } from "@/infrastructure/api/repositories";
import {
  exitFullscreen,
  requestFullscreen,
} from "@/features/contest/hooks/useContestExamActions";
import { useNavigate, useLocation } from "react-router-dom";
import { ExamOverlays } from "@/features/contest/components/exam/ExamOverlays";
import { ExamModals } from "@/features/contest/components/exam/ExamModals";
import { useTranslation } from "react-i18next";
import { useInterval } from "@/shared/hooks/useInterval";
import { useContestTimers } from "@/features/contest/hooks/useContestTimers";

// Anti-cheat timing constants (module-level to avoid recreation on each render)
const BLUR_DEBOUNCE_MS = 200; // Time to wait after user interaction before detecting blur (reduced for faster detection)
const FOCUS_CHECK_DELAY_MS = 50; // Delay for document.hasFocus() check to allow event loop to settle
const GRACE_PERIOD_SECONDS = 3; // Grace period countdown in seconds

interface ExamModeWrapperProps {
  contestId: string;
  examModeEnabled: boolean;
  isActive: boolean;
  isLocked?: boolean;
  lockReason?: string;
  examStatus?: ExamStatusType;
  currentUserRole?: UserRole;
  onExamStart?: () => void;
  onExamEnd?: () => void;
  onRefresh?: () => Promise<void>;
  children: ReactNode;
}

const ExamModeWrapper: React.FC<ExamModeWrapperProps> = ({
  contestId,
  examModeEnabled,
  isActive,
  isLocked,
  lockReason,
  examStatus,
  currentUserRole,
  onRefresh,
  children,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation("contest");
  const [examState, setExamState] = useState<ExamModeState>({
    isActive: false,
    isLocked: false,
    violationCount: 0,
    maxWarnings: 0,
  });
  const [showWarning, setShowWarning] = useState(false);
  const [warningEventType, setWarningEventType] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isGracePeriod = useRef(false);
  const isSubmitting = useRef(false);
  const prevIsActiveRef = useRef(false);
  const blurCheckTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );

  // Blocking modal flow states
  // Note: isProcessingEvent state kept for potential future UI needs, using ref for real-time checks
  const [, setIsProcessingEvent] = useState(false);
  const isProcessingEventRef = useRef(false); // Ref for real-time access in event handlers
  const [pendingApiResponse, setPendingApiResponse] = useState(false);
  const [lastApiResponse, setLastApiResponse] = useState<any>(null);

  // Unlock notification state
  const [showUnlockNotification, setShowUnlockNotification] = useState(false);
  const prevExamStatusRef = useRef(examStatus);

  // Grace period countdown (in seconds)
  const [gracePeriodCountdown, setGracePeriodCountdown] = useState(0);

  // Fullscreen exit confirmation modal state (for locked/paused/in_progress)
  const [showFullscreenExitConfirm, setShowFullscreenExitConfirm] =
    useState(false);
  const [isSubmittingFromFullscreenExit, setIsSubmittingFromFullscreenExit] =
    useState(false);
  const initialFullscreenCheckDone = useRef(false);

  // Admin/Teacher bypass
  const isBypassed =
    currentUserRole === "admin" || currentUserRole === "teacher";

  // Initial check: if exam is active but not in fullscreen after page load, show confirmation
  useEffect(() => {
    // Only check once after initial render and exam status is known
    if (initialFullscreenCheckDone.current || !examModeEnabled || isBypassed)
      return;

    const shouldBeInFullscreen =
      examStatus === "in_progress" ||
      examStatus === "locked" ||
      examStatus === "paused";

    if (shouldBeInFullscreen && !document.fullscreenElement) {
      // Give a small delay to allow user to manually enter fullscreen
      const timer = setTimeout(() => {
        if (!document.fullscreenElement && !isSubmittingFromFullscreenExit) {
          setShowFullscreenExitConfirm(true);
        }
        initialFullscreenCheckDone.current = true;
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      initialFullscreenCheckDone.current = true;
    }
  }, [examStatus, examModeEnabled, isBypassed, isSubmittingFromFullscreenExit]);

  useEffect(() => {
    // Use examStatus as primary source if available
    const effectiveIsLocked = examStatus === "locked" || !!isLocked;
    // Only consider "in_progress" as truly active (monitoring enabled)
    // This ensures grace period only starts when anti-cheat monitoring is actually active
    const effectiveIsActive = examStatus === "in_progress";

    setExamState((prev) => ({
      ...prev,
      isActive: effectiveIsActive,
      isLocked: effectiveIsLocked,
      lockReason: lockReason || prev.lockReason,
    }));

    // Detect unlock transition: locked -> paused
    if (prevExamStatusRef.current === "locked" && examStatus === "paused") {
      setShowUnlockNotification(true);
    }

    // Exit fullscreen ONLY when exam is submitted (not for locked/paused)
    if (
      examStatus === "submitted" &&
      prevExamStatusRef.current !== "submitted"
    ) {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch((e) => {
          console.warn("Failed to exit fullscreen on submit:", e);
        });
      }
    }

    // Stay in fullscreen when transitioning to locked or paused (do NOT exit)
    // Fullscreen is only allowed to exit after submission
    // Also ensure fullscreen is entered when transitioning TO locked or paused states
    if (
      examModeEnabled &&
      !isBypassed &&
      (examStatus === "locked" || examStatus === "paused") &&
      !document.fullscreenElement
    ) {
      // Use setTimeout to avoid blocking the state update
      setTimeout(() => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch((e) => {
            console.warn(
              "[Exam] Failed to enter fullscreen for locked/paused state:",
              e
            );
          });
        }
      }, 100);
    }

    prevExamStatusRef.current = examStatus;

    // Start grace period ONLY when exam monitoring is truly active (in_progress)
    // This ensures the countdown only appears when anti-cheat is enabled
    // Must also check examModeEnabled to avoid false triggers
    const shouldStartGracePeriod =
      examModeEnabled &&
      effectiveIsActive &&
      !prevIsActiveRef.current &&
      !isBypassed;

    if (shouldStartGracePeriod) {
      // Reset processing state for fresh start (important after unlock!)
      setIsProcessingEvent(false);
      isProcessingEventRef.current = false;

      isGracePeriod.current = true;
      setGracePeriodCountdown(GRACE_PERIOD_SECONDS);

      // Auto enter fullscreen (mandatory when monitoring is active)
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch((e) => {
          console.warn("Failed to enter fullscreen automatically:", e);
        });
      }
    }
    prevIsActiveRef.current = effectiveIsActive;
  }, [
    isActive,
    isLocked,
    lockReason,
    examStatus,
    examModeEnabled,
    isBypassed,
    currentUserRole,
  ]);

  useInterval(() => {
    setGracePeriodCountdown((prev) => {
      if (prev <= 1) {
        isGracePeriod.current = false;
        return 0;
      }
      return prev - 1;
    });
  }, gracePeriodCountdown > 0 ? 1000 : null);

  // Track last interaction time to debounce blur events during submit
  const lastInteractionTime = useRef<number>(0);

  // Update interaction time on any user interaction (helps detect button clicks and form interactions)
  useEffect(() => {
    const handleInteraction = () => {
      lastInteractionTime.current = Date.now();
    };
    // Track multiple interaction types to catch all user actions
    // Using capture phase (true) to ensure we catch events before they're handled
    document.addEventListener("mousedown", handleInteraction, true);
    document.addEventListener("pointerdown", handleInteraction, true);
    document.addEventListener("click", handleInteraction, true);
    document.addEventListener("keydown", handleInteraction, true);
    document.addEventListener("keyup", handleInteraction, true);
    document.addEventListener("touchstart", handleInteraction, true);
    document.addEventListener("touchend", handleInteraction, true);
    document.addEventListener("focusin", handleInteraction, true);
    document.addEventListener("focusout", handleInteraction, true);
    document.addEventListener("input", handleInteraction, true);
    return () => {
      document.removeEventListener("mousedown", handleInteraction, true);
      document.removeEventListener("pointerdown", handleInteraction, true);
      document.removeEventListener("click", handleInteraction, true);
      document.removeEventListener("keydown", handleInteraction, true);
      document.removeEventListener("keyup", handleInteraction, true);
      document.removeEventListener("touchstart", handleInteraction, true);
      document.removeEventListener("touchend", handleInteraction, true);
      document.removeEventListener("focusin", handleInteraction, true);
      document.removeEventListener("focusout", handleInteraction, true);
      document.removeEventListener("input", handleInteraction, true);
    };
  }, []);

  // prevIsActiveRef moved to top with other refs

  useEffect(() => {
    // Use examStatus prop directly to avoid React state batching delays
    const isCurrentlyActive = examStatus === "in_progress";
    const isCurrentlyLocked = examStatus === "locked";

    if (!examModeEnabled || !isCurrentlyActive || isBypassed) return;

    // Blocking modal flow: detect -> pause -> show modal -> API -> wait -> close
    const handleCheatEvent = async (eventType: string, reason: string) => {
      // Skip if already processing, locked, in grace period, or submitting
      // Use refs for real-time values instead of closure-captured state
      if (
        isProcessingEventRef.current ||
        isCurrentlyLocked ||
        isGracePeriod.current ||
        isSubmitting.current
      )
        return;

      // 1. Immediately pause detection
      isProcessingEventRef.current = true;
      setIsProcessingEvent(true);

      // 2. Show blocking modal and mark API as pending
      setPendingApiResponse(true);
      setWarningEventType(eventType);
      setShowWarning(true);

      // 3. Send API request
      try {
        const response = await recordExamEvent(contestId, eventType, reason);

        // 4. Store response for modal close handler
        setLastApiResponse(response);

        // Update violation count in state
        if (response && typeof response === "object") {
          const {
            violation_count,
            max_cheat_warnings,
            auto_unlock_at,
            bypass,
          } = response;
          if (!bypass) {
            setExamState((prev) => ({
              ...prev,
              violationCount: violation_count,
              maxWarnings: max_cheat_warnings,
              autoUnlockAt: auto_unlock_at,
            }));
          }
        }
      } catch (error) {
        console.error("Failed to record event:", error);
        setLastApiResponse({ error: true });
      }

      // 5. Allow modal close
      setPendingApiResponse(false);
    };

    // Event handlers
    const handleVisibilityChange = async () => {
      if (document.visibilityState === "hidden") {
        await handleCheatEvent("tab_hidden", t("exam.tabHidden"));
      }
    };

    const handleBlur = () => {
      // Skip blur events that happen within BLUR_DEBOUNCE_MS of any user interaction
      // This prevents false positives from button clicks or form interactions
      const timeSinceInteraction = Date.now() - lastInteractionTime.current;
      if (timeSinceInteraction < BLUR_DEBOUNCE_MS) {
        console.log(
          "[Anti-cheat] Ignoring blur event - recent user interaction detected"
        );
        return;
      }

      // Clear any pending blur check timeout (clearTimeout handles undefined gracefully)
      clearTimeout(blurCheckTimeoutRef.current);

      // Short delay to verify focus was actually lost (not just a temporary browser event)
      blurCheckTimeoutRef.current = setTimeout(() => {
        blurCheckTimeoutRef.current = undefined;

        // Check if document still has focus
        if (!document.hasFocus()) {
          // Trigger cheat event - window lost focus
          handleCheatEvent("window_blur", t("exam.windowBlur")).catch(
            (error) => {
              console.error(
                "[Anti-cheat] Failed to record window blur event:",
                error
              );
            }
          );
        } else {
          console.log(
            "[Anti-cheat] Ignoring blur event - document still has focus"
          );
        }
      }, FOCUS_CHECK_DELAY_MS);
    };

    const handleFullscreenChange = async () => {
      if (!document.fullscreenElement) {
        await handleCheatEvent("exit_fullscreen", t("exam.exitedFullscreen"));
      }
    };

    // Add event listeners
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);

      // Clean up any pending blur check timeout (clearTimeout handles undefined gracefully)
      clearTimeout(blurCheckTimeoutRef.current);
      blurCheckTimeoutRef.current = undefined;
    };
  }, [examModeEnabled, examStatus, contestId, location.pathname, isBypassed]);

  // Monitor fullscreen exit for locked/paused states - show submit confirmation
  useEffect(() => {
    const shouldMonitorFullscreen =
      examModeEnabled &&
      !isBypassed &&
      (examStatus === "locked" || examStatus === "paused");

    if (!shouldMonitorFullscreen) return;

    const handleFullscreenExitForLockedPaused = () => {
      if (!document.fullscreenElement && !isSubmittingFromFullscreenExit) {
        // User exited fullscreen while locked/paused - show submit confirmation
        setShowFullscreenExitConfirm(true);
      }
    };

    document.addEventListener(
      "fullscreenchange",
      handleFullscreenExitForLockedPaused
    );

    return () => {
      document.removeEventListener(
        "fullscreenchange",
        handleFullscreenExitForLockedPaused
      );
    };
  }, [examModeEnabled, examStatus, isBypassed, isSubmittingFromFullscreenExit]);

  const isAllowedPath = () => {
    // Allow dashboard, standings, and submissions
    const path = location.pathname;
    // Check if path ends with contestId (dashboard) or specific allowed sub-paths
    // We need to be careful with trailing slashes
    const normalizedPath = path.endsWith("/") ? path.slice(0, -1) : path;
    const contestBase = `/contests/${contestId}`;

    return (
      normalizedPath === contestBase ||
      normalizedPath === `${contestBase}/standings` ||
      normalizedPath === `${contestBase}/submissions` ||
      normalizedPath === `${contestBase}/clarifications`
    );
  };

  const shouldShowLockScreen = examState.isLocked && !isAllowedPath();
  const { unlockTimeLeft } = useContestTimers({
    contest: null,
    contestId,
    refreshContest: onRefresh,
    enableMainCountdown: false,
    autoUnlockAt: shouldShowLockScreen ? examState.autoUnlockAt ?? null : null,
    examStatus: examStatus ?? null,
  });

  const handleWarningClose = async () => {
    // Block close if API response is still pending
    if (pendingApiResponse) return;

    setShowWarning(false);

    // Check if locked based on API response
    if (lastApiResponse?.locked) {
      // Stay in fullscreen when locked - don't exit
      // Ensure fullscreen is maintained even when locked (no exam monitoring, just fullscreen)
      if (!document.fullscreenElement) {
        try {
          await document.documentElement.requestFullscreen();
          console.log("[Exam] Re-entering fullscreen after being locked");
        } catch (error) {
          console.error("[Exam] Failed to re-enter fullscreen:", error);
        }
      }
      // Then refresh to show lock screen overlay
      if (onRefresh) onRefresh();
    } else {
      // Resume monitoring - force fullscreen (mandatory)
      isProcessingEventRef.current = false;
      setIsProcessingEvent(false);
      if (!document.fullscreenElement) {
        try {
          await document.documentElement.requestFullscreen();
          console.log("[Anti-cheat] Re-entering fullscreen after warning");
        } catch (error) {
          console.error("[Anti-cheat] Failed to re-enter fullscreen:", error);
        }
      }
    }

    // Reset states
    setWarningEventType(null);
    setLastApiResponse(null);
  };

  // Handle fullscreen exit confirmation for locked/paused states
  const handleFullscreenExitConfirm = async () => {
    setIsSubmittingFromFullscreenExit(true);
    try {
      // Submit the exam
      await serviceEndExam(contestId);
      if (onRefresh) await onRefresh();
      setShowFullscreenExitConfirm(false);
      // Fullscreen exit is now allowed (exam is submitted)
    } catch (error) {
      console.error("Failed to submit exam:", error);
      // Still close the modal but try to re-enter fullscreen
      setShowFullscreenExitConfirm(false);
      try {
        await document.documentElement.requestFullscreen();
      } catch (e) {
        console.error("Failed to re-enter fullscreen:", e);
      }
    } finally {
      setIsSubmittingFromFullscreenExit(false);
    }
  };

  const handleUnlockContinue = async () => {
    setShowUnlockNotification(false);
    // Ensure fullscreen is maintained after unlock notification
    if (!document.fullscreenElement) {
      try {
        await document.documentElement.requestFullscreen();
        console.log("[Exam] Re-entering fullscreen after unlock notification");
      } catch (error) {
        console.error("[Exam] Failed to re-enter fullscreen:", error);
      }
    }
  };

  const handleFullscreenExitCancel = async () => {
    setShowFullscreenExitConfirm(false);
    // Re-enter fullscreen
    try {
      await document.documentElement.requestFullscreen();
    } catch (error) {
      console.error("Failed to re-enter fullscreen:", error);
    }
  };

  const handleBackToContest = async () => {
    // Do not exit fullscreen - stay in exam mode
    // Navigate to dashboard and refresh to ensure clean state
    // Navigate to dashboard and refresh to ensure clean state
    navigate(`/contests/${contestId}`);
    if (onRefresh) onRefresh();
  };

  return (
    <div
      ref={containerRef}
      style={{ position: "relative", width: "100%", height: "100%", flex: 1 }}
    >
      {children}
      <ExamOverlays
        showGracePeriod={examModeEnabled && !isBypassed && gracePeriodCountdown > 0}
        gracePeriodCountdown={gracePeriodCountdown}
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

// Export helper functions for parent components
export const createExamHandlers = (
  contestId: string,
  examModeEnabled: boolean,
  onSuccess?: () => void,
  userId?: string, // Add userId parameter here
  unlockParticipant?: (contestId: string, userId: string) => Promise<void> // Add unlockParticipant parameter here
) => {
  const startExam = async () => {
    try {
      // Check if unlockParticipant is provided and userId is available
      if (unlockParticipant && userId) {
        await unlockParticipant(contestId, userId);
      } else {
        // Fallback or error if unlockParticipant/userId not provided
        console.warn(
          "unlockParticipant or userId not provided to createExamHandlers. Skipping unlock."
        );
        // Optionally, you might still want to call api.startExam if unlockParticipant is not the primary action
        // await api.startExam(contestId);
      }

      if (examModeEnabled) {
        try {
          await requestFullscreen();
        } catch (error) {
          console.error("Failed to enter fullscreen:", error);
        }
      }

      onSuccess?.();
      return true;
    } catch (error) {
      console.error("Failed to start exam:", error);
      return false;
    }
  };

  const endExam = async () => {
    try {
      await serviceEndExam(contestId);

      if (document.fullscreenElement) {
        try {
          await exitFullscreen();
        } catch (error) {
          console.error("Failed to exit fullscreen:", error);
        }
      }

      onSuccess?.();
      return true;
    } catch (error) {
      console.error("Failed to end exam:", error);
      return false;
    }
  };

  return { startExam, endExam };
};
