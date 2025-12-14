import { useEffect, useState, useRef } from "react";
import type { ReactNode } from "react";
import type {
  ExamModeState,
  ExamStatusType,
} from "@/core/entities/contest.entity";
import type { UserRole } from "@/core/entities/user.entity";
import { endExam as serviceEndExam, recordExamEvent } from "@/services/contest";
import { useNavigate, useLocation } from "react-router-dom";
import { Modal, Button } from "@carbon/react";
import { WarningAlt, Locked, CheckmarkFilled } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";

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
  const { t: tc } = useTranslation("common");
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

      // Countdown timer
      const countdownInterval = setInterval(() => {
        setGracePeriodCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(countdownInterval);
            isGracePeriod.current = false;
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

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

  // Monitor fullscreen exit for locked/paused states - treat as submit confirmation
  useEffect(() => {
    const shouldMonitorFullscreen =
      examModeEnabled &&
      !isBypassed &&
      (examStatus === "locked" || examStatus === "paused");

    if (!shouldMonitorFullscreen) return;

    const handleFullscreenExitForLockedPaused = () => {
      if (!document.fullscreenElement && !isSubmittingFromFullscreenExit) {
        // User exited fullscreen while locked/paused - show confirmation
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

  // Auto-unlock countdown logic
  const [timeLeft, setTimeLeft] = useState<string | null>(null);

  useEffect(() => {
    if (!shouldShowLockScreen || !examState.autoUnlockAt) {
      setTimeLeft(null);
      return;
    }

    const timer = setInterval(() => {
      const now = new Date().getTime();
      const unlockTime = new Date(examState.autoUnlockAt!).getTime();
      const diff = unlockTime - now;

      if (diff <= 0) {
        setTimeLeft("00:00:00");
        clearInterval(timer);
        clearInterval(timer);
        // Optional: Auto-refresh or unlock
        if (onRefresh) onRefresh();
      } else {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeLeft(
          `${hours.toString().padStart(2, "0")}:${minutes
            .toString()
            .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
        );
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [shouldShowLockScreen, examState.autoUnlockAt]);

  const handleWarningClose = async () => {
    // Block close if API response is still pending
    if (pendingApiResponse) return;

    setShowWarning(false);

    // Check if locked based on API response
    if (lastApiResponse?.locked) {
      // Stay in fullscreen when locked - don't exit
      // Just refresh to show lock screen overlay
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

      {/* Grace Period Countdown Overlay - Only show when exam monitoring is active */}
      {examModeEnabled && !isBypassed && gracePeriodCountdown > 0 && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "#161616", // Always dark background for cinema/focus mode
            zIndex: 9998,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: "1.5rem",
          }}
        >
          <div style={{ textAlign: "center", maxWidth: "400px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                marginBottom: "1rem",
              }}
            >
              <CheckmarkFilled
                size={28}
                style={{ color: "var(--cds-support-success, #42be65)" }}
              />
              <span
                style={{
                  fontSize: "1.25rem",
                  fontWeight: 600,
                  color: "var(--cds-text-on-color, #fff)",
                }}
              >
                {t("exam.modeEnabled")}
              </span>
            </div>
            <p
              style={{
                fontSize: "0.875rem",
                color: "var(--cds-text-on-color-disabled, #8d8d8d)",
                marginBottom: "2rem",
                lineHeight: 1.5,
              }}
            >
              {t("exam.antiCheatStarting")}
            </p>
            <div
              style={{
                fontSize: "6rem",
                fontWeight: 300,
                fontFamily: "'IBM Plex Mono', monospace",
                color: "var(--cds-text-on-color, #fff)",
                lineHeight: 1,
              }}
            >
              {gracePeriodCountdown}
            </div>
            <p
              style={{
                fontSize: "0.75rem",
                color: "var(--cds-text-on-color-disabled, #8d8d8d)",
                marginTop: "2rem",
                textTransform: "uppercase",
                letterSpacing: "1px",
              }}
            >
              {t("exam.doNotSwitchTabs")}
            </p>
          </div>
        </div>
      )}

      {/* Lock Overlay */}
      {shouldShowLockScreen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "#161616", // Always dark background for lock screen
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
          }}
        >
          <div
            style={{ textAlign: "center", maxWidth: "480px", padding: "2rem" }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.75rem",
                marginBottom: "1rem",
              }}
            >
              <Locked
                size={40}
                style={{ color: "var(--cds-support-error, #fa4d56)" }}
              />
              <h1
                style={{
                  fontSize: "2rem",
                  fontWeight: 400,
                  margin: 0,
                  color: "var(--cds-support-error, #fa4d56)",
                }}
              >
                {t("exam.answerLocked")}
              </h1>
            </div>

            {/* Lock reason */}
            <p
              style={{
                fontSize: "1rem",
                color: "var(--cds-text-on-color-disabled, #8d8d8d)",
                marginBottom: "2rem",
                fontFamily: "'IBM Plex Mono', monospace",
              }}
            >
              {examState.lockReason}
            </p>

            {/* Countdown box */}
            {timeLeft ? (
              <div
                style={{
                  margin: "2rem 0",
                  padding: "1.5rem 2rem",
                  backgroundColor: "var(--cds-layer-02, #262626)",
                  border: "1px solid var(--cds-border-subtle-01, #393939)",
                }}
              >
                <p
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--cds-text-on-color-disabled, #8d8d8d)",
                    marginBottom: "0.75rem",
                    textTransform: "uppercase",
                    letterSpacing: "1px",
                  }}
                >
                  {t("exam.autoUnlockCountdown")}
                </p>
                <div
                  style={{
                    fontSize: "2.5rem",
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontWeight: 400,
                    color: "var(--cds-support-success, #42be65)",
                    letterSpacing: "2px",
                  }}
                >
                  {timeLeft}
                </div>
              </div>
            ) : (
              <p
                style={{
                  fontSize: "1rem",
                  color: "var(--cds-text-on-color-disabled, #8d8d8d)",
                  marginBottom: "2rem",
                }}
              >
                {t("exam.contactProctorToUnlock")}
              </p>
            )}

            <p
              style={{
                fontSize: "0.875rem",
                color: "var(--cds-text-on-color-disabled, #6f6f6f)",
                marginTop: "1.5rem",
                marginBottom: "2rem",
              }}
            >
              {t("exam.violationRecorded")}
            </p>

            {/* Action */}
            <div style={{ marginTop: "1.5rem" }}>
              <Button
                kind="ghost"
                onClick={handleBackToContest}
                style={{ color: "var(--cds-text-on-color, #fff)" }}
              >
                {t("exam.backToDashboard")}
              </Button>
              <p
                style={{
                  marginTop: "0.5rem",
                  fontSize: "0.75rem",
                  color: "var(--cds-text-on-color-disabled, #6f6f6f)",
                }}
              >
                {t("exam.canViewButNoAnswer")}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Warning Modal - blocks until API responds */}
      <Modal
        open={showWarning}
        modalHeading={t("exam.violationWarning")}
        primaryButtonText={
          pendingApiResponse
            ? t("exam.processing")
            : lastApiResponse?.locked
            ? tc("button.confirm")
            : t("exam.iUnderstand")
        }
        primaryButtonDisabled={pendingApiResponse}
        onRequestSubmit={() => handleWarningClose()}
        onRequestClose={() => handleWarningClose()}
        preventCloseOnClickOutside
        danger
        size="sm"
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
          }}
        >
          {/* Icon */}
          <div
            style={{
              padding: "1rem",
              backgroundColor: pendingApiResponse
                ? "var(--cds-layer-02)"
                : "var(--cds-notification-background-warning)",
              borderRadius: "50%",
              marginBottom: "1.5rem",
            }}
          >
            <WarningAlt
              size={40}
              style={{
                color: pendingApiResponse
                  ? "var(--cds-icon-disabled)"
                  : "var(--cds-support-warning)",
              }}
            />
          </div>

          {/* Title */}
          <p
            style={{
              fontSize: "1.25rem",
              fontWeight: 600,
              marginBottom: "0.5rem",
              color: "var(--cds-text-primary)",
            }}
          >
            {pendingApiResponse
              ? t("exam.recordingViolation")
              : t("exam.abnormalBehavior")}
          </p>

          {/* Event type */}
          <p
            style={{
              marginBottom: "1rem",
              color: "var(--cds-text-secondary)",
              fontSize: "0.875rem",
            }}
          >
            {warningEventType === "tab_hidden" && t("exam.tabHidden")}
            {warningEventType === "window_blur" && t("exam.windowBlur")}
            {warningEventType === "exit_fullscreen" &&
              t("exam.exitedFullscreen")}
          </p>

          {/* Instruction */}
          <p
            style={{
              marginBottom: "1.5rem",
              fontSize: "0.875rem",
              color: "var(--cds-text-primary)",
            }}
          >
            {t("exam.stayInExamPage")}
          </p>

          {/* Violation count box */}
          {!pendingApiResponse &&
            examState.violationCount !== undefined &&
            examState.maxWarnings !== undefined && (
              <div
                style={{
                  width: "100%",
                  backgroundColor: "var(--cds-layer-01)",
                  padding: "1rem",
                  border: "1px solid var(--cds-border-subtle)",
                  marginBottom: "1rem",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "0.75rem",
                    fontSize: "0.875rem",
                  }}
                >
                  <span style={{ color: "var(--cds-text-secondary)" }}>
                    {t("exam.accumulatedViolations")}
                  </span>
                  <span
                    style={{
                      fontWeight: 600,
                      color: "var(--cds-support-error)",
                    }}
                  >
                    {examState.violationCount}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.875rem",
                  }}
                >
                  <span style={{ color: "var(--cds-text-secondary)" }}>
                    {t("exam.remainingChances")}
                  </span>
                  <span
                    style={{
                      fontWeight: 600,
                      color: lastApiResponse?.locked
                        ? "var(--cds-support-error)"
                        : "var(--cds-support-success)",
                    }}
                  >
                    {lastApiResponse?.locked
                      ? t("exam.alreadyLocked")
                      : Math.max(
                          0,
                          examState.maxWarnings + 1 - examState.violationCount
                        )}
                  </span>
                </div>
              </div>
            )}

          {/* Warning message */}
          {lastApiResponse?.locked ? (
            <p
              style={{
                marginTop: "0.5rem",
                color: "var(--cds-support-error)",
                fontSize: "0.875rem",
                fontWeight: 600,
              }}
            >
              {t("exam.examLocked")}
            </p>
          ) : (
            <p
              style={{
                marginTop: "0.5rem",
                color: "var(--cds-support-error)",
                fontSize: "0.75rem",
              }}
            >
              {t("exam.zeroChanceWarning")}
            </p>
          )}
        </div>
      </Modal>

      {/* Unlock Notification Modal */}
      <Modal
        open={showUnlockNotification}
        modalHeading={t("exam.unlocked")}
        primaryButtonText={t("exam.continueExam")}
        onRequestSubmit={() => setShowUnlockNotification(false)}
        onRequestClose={() => setShowUnlockNotification(false)}
        size="sm"
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
          }}
        >
          {/* Icon */}
          <div
            style={{
              padding: "1rem",
              backgroundColor: "var(--cds-notification-background-success)",
              borderRadius: "50%",
              marginBottom: "1.5rem",
            }}
          >
            <CheckmarkFilled
              size={40}
              style={{ color: "var(--cds-support-success)" }}
            />
          </div>

          {/* Title */}
          <p
            style={{
              fontSize: "1.25rem",
              fontWeight: 600,
              marginBottom: "0.75rem",
              color: "var(--cds-text-primary)",
            }}
          >
            {t("exam.examUnlockedTitle")}
          </p>

          {/* Description */}
          <p
            style={{
              marginBottom: "1.5rem",
              fontSize: "0.875rem",
              color: "var(--cds-text-primary)",
              lineHeight: 1.5,
            }}
          >
            {t("exam.examUnlockedDesc")}
          </p>

          {/* Reminder */}
          <div
            style={{
              width: "100%",
              padding: "0.75rem 1rem",
              backgroundColor: "var(--cds-layer-01)",
              border: "1px solid var(--cds-border-subtle)",
              textAlign: "left",
            }}
          >
            <p
              style={{
                fontSize: "0.75rem",
                color: "var(--cds-text-secondary)",
                margin: 0,
              }}
            >
              {t("exam.followRulesReminder")}
            </p>
          </div>
        </div>
      </Modal>

      {/* Fullscreen Exit Confirmation Modal (for locked/paused states) */}
      <Modal
        open={showFullscreenExitConfirm}
        modalHeading={t("exam.confirmExitFullscreenAndSubmit")}
        primaryButtonText={
          isSubmittingFromFullscreenExit
            ? t("exam.submittingExam")
            : t("exam.confirmSubmitExam")
        }
        secondaryButtonText={tc("button.cancel")}
        primaryButtonDisabled={isSubmittingFromFullscreenExit}
        onRequestSubmit={handleFullscreenExitConfirm}
        onRequestClose={handleFullscreenExitCancel}
        preventCloseOnClickOutside
        danger
        size="sm"
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
          }}
        >
          {/* Icon */}
          <div
            style={{
              padding: "1rem",
              backgroundColor: "var(--cds-notification-background-warning)",
              borderRadius: "50%",
              marginBottom: "1.5rem",
            }}
          >
            <WarningAlt
              size={40}
              style={{ color: "var(--cds-support-warning)" }}
            />
          </div>

          {/* Title */}
          <p
            style={{
              fontSize: "1.25rem",
              fontWeight: 600,
              marginBottom: "0.75rem",
              color: "var(--cds-text-primary)",
            }}
          >
            {t("exam.leavingFullscreen")}
          </p>

          {/* Description */}
          <p
            style={{
              marginBottom: "1.5rem",
              fontSize: "0.875rem",
              color: "var(--cds-text-secondary)",
              lineHeight: 1.5,
            }}
          >
            {t("exam.leaveFullscreenWillSubmit")}
            <br />
            {t("exam.autoSubmitNoMoreAnswer")}
          </p>

          {/* Warning */}
          <div
            style={{
              width: "100%",
              padding: "0.75rem 1rem",
              backgroundColor: "var(--cds-notification-background-error)",
              textAlign: "center",
            }}
          >
            <p
              style={{
                fontSize: "0.875rem",
                color: "var(--cds-support-error)",
                margin: 0,
                fontWeight: 600,
              }}
            >
              {t("exam.cannotUndo")}
            </p>
          </div>
        </div>
      </Modal>
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

      if (examModeEnabled && document.body) {
        try {
          await document.body.requestFullscreen();
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
          await document.exitFullscreen();
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
