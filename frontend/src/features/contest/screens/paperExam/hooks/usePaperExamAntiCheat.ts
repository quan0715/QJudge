import { useEffect, useState, useCallback, useRef } from "react";
import { recordViolationUseCase } from "@/core/usecases/exam/recordViolation.usecase";
import type { ViolationEventType, RecordViolationOutput } from "@/core/usecases/exam/recordViolation.usecase";
import type { ExamModeState, ExamStatusType } from "@/core/entities/contest.entity";

const WARNING_TIMEOUT_SECONDS = 15;

interface UsePaperExamAntiCheatOptions {
  contestId: string | undefined;
  isInProgress: boolean;
  examStatus?: ExamStatusType;
  refreshContest?: () => Promise<unknown>;
}

export interface AntiCheatState {
  showWarning: boolean;
  pendingApiResponse: boolean;
  lastApiResponse: RecordViolationOutput | null;
  warningEventType: ViolationEventType | null;
  examState: ExamModeState;
  showLockScreen: boolean;
  lockReason: string;
  autoUnlockTimeLeft: string | null;
  showUnlockNotification: boolean;
  warningCountdown: number | null;
}

export interface AntiCheatActions {
  onWarningClose: () => void;
  onUnlockContinue: () => void;
  onBackToContest: () => void;
}

export function usePaperExamAntiCheat({
  contestId,
  isInProgress,
  examStatus,
  refreshContest,
}: UsePaperExamAntiCheatOptions): AntiCheatState & AntiCheatActions {
  const [showWarning, setShowWarning] = useState(false);
  const [pendingApiResponse, setPendingApiResponse] = useState(false);
  const [lastApiResponse, setLastApiResponse] = useState<RecordViolationOutput | null>(null);
  const [warningEventType, setWarningEventType] = useState<ViolationEventType | null>(null);
  const [examState, setExamState] = useState<ExamModeState>({
    isActive: false,
    isLocked: false,
  });
  const [showLockScreen, setShowLockScreen] = useState(false);
  const [lockReason, setLockReason] = useState("");
  const [autoUnlockTimeLeft, setAutoUnlockTimeLeft] = useState<string | null>(null);
  const [showUnlockNotification, setShowUnlockNotification] = useState(false);
  const [warningCountdown, setWarningCountdown] = useState<number | null>(null);

  const autoUnlockAtRef = useRef<string | null>(null);
  const prevExamStatusRef = useRef<ExamStatusType | undefined>(examStatus);
  const warningTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<number | null>(null);

  // Clear warning timeout timer
  const clearWarningTimer = useCallback(() => {
    if (warningTimerRef.current) {
      clearInterval(warningTimerRef.current);
      warningTimerRef.current = null;
    }
    countdownRef.current = null;
    setWarningCountdown(null);
  }, []);

  // Handle violation event
  const handleViolation = useCallback(
    async (eventType: ViolationEventType) => {
      if (!contestId || showWarning || showLockScreen) return;

      setWarningEventType(eventType);
      setShowWarning(true);
      setPendingApiResponse(true);
      setLastApiResponse(null);

      const result = await recordViolationUseCase({ contestId, eventType });

      setPendingApiResponse(false);
      setLastApiResponse(result);
      setExamState((prev) => ({
        ...prev,
        isActive: true,
        violationCount: result.violationCount,
        maxWarnings: result.maxWarnings,
        isLocked: result.isLocked,
        autoUnlockAt: result.autoUnlockAt,
      }));

      if (result.isLocked) {
        autoUnlockAtRef.current = result.autoUnlockAt || null;
        setLockReason(
          eventType === "warning_timeout"
            ? "Warning timeout: did not acknowledge within 15 seconds"
            : `System lock: ${eventType}`
        );
      }
    },
    [contestId, showWarning, showLockScreen]
  );

  // 15-second warning timeout timer
  useEffect(() => {
    if (
      showWarning &&
      !pendingApiResponse &&
      lastApiResponse &&
      !lastApiResponse.isLocked
    ) {
      // Start 15s countdown
      countdownRef.current = WARNING_TIMEOUT_SECONDS;
      setWarningCountdown(WARNING_TIMEOUT_SECONDS);

      warningTimerRef.current = setInterval(() => {
        if (countdownRef.current === null) return;
        countdownRef.current -= 1;
        setWarningCountdown(countdownRef.current);

        if (countdownRef.current <= 0) {
          clearWarningTimer();
          // Fire warning_timeout event
          if (contestId) {
            recordViolationUseCase({
              contestId,
              eventType: "warning_timeout",
              reason: "Warning not acknowledged within 15 seconds",
            }).then((result) => {
              setShowWarning(false);
              setLastApiResponse(result);
              setExamState((prev) => ({
                ...prev,
                isLocked: true,
                violationCount: result.violationCount,
                maxWarnings: result.maxWarnings,
                autoUnlockAt: result.autoUnlockAt,
              }));
              autoUnlockAtRef.current = result.autoUnlockAt || null;
              setLockReason(
                "Warning timeout: did not acknowledge within 15 seconds"
              );
              setShowLockScreen(true);
            });
          }
        }
      }, 1000);
    }

    return () => clearWarningTimer();
  }, [showWarning, pendingApiResponse, lastApiResponse, contestId, clearWarningTimer]);

  // Handle warning modal close
  const onWarningClose = useCallback(() => {
    clearWarningTimer();
    setShowWarning(false);
    setWarningEventType(null);

    if (lastApiResponse?.isLocked) {
      setShowLockScreen(true);
    }
  }, [lastApiResponse, clearWarningTimer]);

  // Handle unlock notification continue
  const onUnlockContinue = useCallback(() => {
    setShowUnlockNotification(false);
    setShowLockScreen(false);
    setExamState((prev) => ({ ...prev, isLocked: false }));
    refreshContest?.();
  }, [refreshContest]);

  // Back to contest dashboard
  const onBackToContest = useCallback(() => {
    // Navigate handled by parent - just expose the intent
  }, []);

  // Auto-unlock countdown for lock screen
  useEffect(() => {
    if (!showLockScreen || !autoUnlockAtRef.current) {
      setAutoUnlockTimeLeft(null);
      return;
    }

    const updateTimeLeft = () => {
      const unlockAt = new Date(autoUnlockAtRef.current!).getTime();
      const now = Date.now();
      const diff = Math.max(0, Math.ceil((unlockAt - now) / 1000));
      if (diff <= 0) {
        setAutoUnlockTimeLeft(null);
        return;
      }
      const minutes = Math.floor(diff / 60);
      const seconds = diff % 60;
      setAutoUnlockTimeLeft(
        `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
      );
    };

    updateTimeLeft();
    const interval = setInterval(updateTimeLeft, 1000);
    return () => clearInterval(interval);
  }, [showLockScreen]);

  // Detect unlock: examStatus goes from LOCKED to something else (e.g. PAUSED)
  useEffect(() => {
    const prev = prevExamStatusRef.current;
    prevExamStatusRef.current = examStatus;

    if (prev === "locked" && examStatus && examStatus !== "locked" && examStatus !== "submitted") {
      setShowLockScreen(false);
      setShowUnlockNotification(true);
      autoUnlockAtRef.current = null;
    }

    // If server says submitted, hide everything
    if (examStatus === "submitted") {
      setShowLockScreen(false);
      setShowWarning(false);
      clearWarningTimer();
    }
  }, [examStatus, clearWarningTimer]);

  // Show lock screen on initial load if already locked
  useEffect(() => {
    if (examStatus === "locked" && !showLockScreen && !showWarning) {
      setShowLockScreen(true);
    }
  }, [examStatus, showLockScreen, showWarning]);

  // Register browser event listeners
  useEffect(() => {
    if (!contestId || !isInProgress) return;

    const onVisibilityChange = () => {
      if (document.hidden) {
        handleViolation("tab_hidden");
      }
    };
    const onBlur = () => {
      handleViolation("window_blur");
    };
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        handleViolation("exit_fullscreen");
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onBlur);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [contestId, isInProgress, handleViolation]);

  return {
    showWarning,
    pendingApiResponse,
    lastApiResponse,
    warningEventType,
    examState,
    showLockScreen,
    lockReason,
    autoUnlockTimeLeft,
    showUnlockNotification,
    warningCountdown,
    onWarningClose,
    onUnlockContinue,
    onBackToContest,
  };
}
