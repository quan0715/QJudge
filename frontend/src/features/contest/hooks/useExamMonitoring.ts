import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { isFullscreen } from "@/core/usecases/exam";
import {
  EXAM_MONITORING_BLUR_CONFIRM_DELAY_MS,
  EXAM_MONITORING_BLUR_DEBOUNCE_MS,
  EXAM_MONITORING_BLUR_SUPPRESSION_AFTER_TAB_HIDDEN_MS,
  EXAM_MONITORING_FOCUS_CHECK_DELAY_MS,
  EXAM_MONITORING_MULTI_DISPLAY_CHECK_INTERVAL_MS,
  EXAM_MONITORING_MULTI_DISPLAY_REPORT_COOLDOWN_MS,
  EXAM_MONITORING_USER_INTERACTION_DISPLAY_CHECK_COOLDOWN_MS,
} from "@/features/contest/domain/examMonitoringPolicy";

const FULLSCREEN_RECOVERY_GRACE_SECONDS = 5;

interface ScreenDetailsLike extends EventTarget {
  screens?: unknown[];
}

type WindowWithScreenDetails = Window & {
  getScreenDetails?: () => Promise<ScreenDetailsLike>;
};

interface UseExamMonitoringProps {
  enabled: boolean;
  onViolation: (eventType: string, reason: string) => Promise<void> | void;
  onBlockedAction?: (message: string) => void;
  onFullscreenRecoveryCountdownChange?: (secondsLeft: number | null) => void;
}

export function useExamMonitoring({
  enabled,
  onViolation,
  onBlockedAction,
  onFullscreenRecoveryCountdownChange,
}: UseExamMonitoringProps) {
  const { t } = useTranslation("contest");
  const lastInteractionTime = useRef<number>(0);
  const lastMultiDisplayReportAt = useRef<number>(0);
  const lastVisibilityHiddenAtRef = useRef<number>(0);
  const lastUserDisplayCheckAt = useRef<number>(0);
  const blurCheckTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const blurConfirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onViolationRef = useRef(onViolation);
  const onBlockedActionRef = useRef(onBlockedAction);
  const onFullscreenRecoveryCountdownChangeRef = useRef(
    onFullscreenRecoveryCountdownChange
  );
  const tRef = useRef(t);
  const fullscreenRecoveryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fullscreenRecoveryIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fullscreenRecoveryActiveRef = useRef(false);
  const fullscreenRecoverySecondsRef = useRef<number>(FULLSCREEN_RECOVERY_GRACE_SECONDS);

  useEffect(() => {
    onViolationRef.current = onViolation;
  }, [onViolation]);

  useEffect(() => {
    onBlockedActionRef.current = onBlockedAction;
  }, [onBlockedAction]);

  useEffect(() => {
    onFullscreenRecoveryCountdownChangeRef.current = onFullscreenRecoveryCountdownChange;
  }, [onFullscreenRecoveryCountdownChange]);

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let screenDetails: ScreenDetailsLike | null = null;
    let attachedScreenDetails: ScreenDetailsLike | null = null;
    let detachScreensChangeListener: (() => void) | null = null;

    const emitViolation = (eventType: string, message: string) =>
      Promise.resolve(onViolationRef.current(eventType, message)).catch(console.error);

    const updateFullscreenRecoveryCountdown = (secondsLeft: number | null) => {
      onFullscreenRecoveryCountdownChangeRef.current?.(secondsLeft);
    };

    const clearFullscreenRecoveryTracking = () => {
      if (fullscreenRecoveryTimeoutRef.current) {
        clearTimeout(fullscreenRecoveryTimeoutRef.current);
        fullscreenRecoveryTimeoutRef.current = null;
      }
      if (fullscreenRecoveryIntervalRef.current) {
        clearInterval(fullscreenRecoveryIntervalRef.current);
        fullscreenRecoveryIntervalRef.current = null;
      }
      fullscreenRecoveryActiveRef.current = false;
      updateFullscreenRecoveryCountdown(null);
    };

    const startFullscreenRecoveryTracking = () => {
      if (fullscreenRecoveryActiveRef.current) return;
      fullscreenRecoveryActiveRef.current = true;
      fullscreenRecoverySecondsRef.current = FULLSCREEN_RECOVERY_GRACE_SECONDS;
      updateFullscreenRecoveryCountdown(FULLSCREEN_RECOVERY_GRACE_SECONDS);

      fullscreenRecoveryIntervalRef.current = setInterval(() => {
        fullscreenRecoverySecondsRef.current -= 1;
        if (fullscreenRecoverySecondsRef.current > 0) {
          updateFullscreenRecoveryCountdown(fullscreenRecoverySecondsRef.current);
        }
      }, 1000);

      fullscreenRecoveryTimeoutRef.current = setTimeout(() => {
        clearFullscreenRecoveryTracking();
        emitViolation("exit_fullscreen", tRef.current("exam.exitedFullscreen"));
      }, FULLSCREEN_RECOVERY_GRACE_SECONDS * 1000);
    };

    const reportMultiDisplayViolation = () => {
      const now = Date.now();
      if (
        now - lastMultiDisplayReportAt.current <
        EXAM_MONITORING_MULTI_DISPLAY_REPORT_COOLDOWN_MS
      ) {
        return;
      }
      lastMultiDisplayReportAt.current = now;
      emitViolation(
        "multiple_displays",
        tRef.current(
          "exam.multipleDisplaysDetected",
          "Multiple displays detected. Please keep only one physical screen connected."
        )
      );
    };

    const hasMultipleDisplays = (screens: unknown[] | undefined) =>
      Array.isArray(screens) && screens.length > 1;

    const checkScreenExtended = () => {
      const screenWithExtended = window.screen as Screen & { isExtended?: boolean };
      return screenWithExtended.isExtended === true;
    };

    const evaluateDisplays = (screens: unknown[] | undefined) => {
      if (hasMultipleDisplays(screens) || checkScreenExtended()) {
        reportMultiDisplayViolation();
      }
    };

    const ensureSingleDisplay = async () => {
      if (disposed) return;

      if (screenDetails) {
        evaluateDisplays(screenDetails.screens);
      }

      const getScreenDetails = (window as WindowWithScreenDetails).getScreenDetails;

      if (!getScreenDetails) {
        if (checkScreenExtended()) reportMultiDisplayViolation();
        return;
      }

      try {
        const details = await getScreenDetails();
        if (disposed) return;

        screenDetails = details;
        evaluateDisplays(details.screens);

        if (
          attachedScreenDetails !== details &&
          typeof details.addEventListener === "function"
        ) {
          if (detachScreensChangeListener) {
            detachScreensChangeListener();
            detachScreensChangeListener = null;
          }
          const onScreensChange = () => evaluateDisplays(screenDetails?.screens);
          details.addEventListener("screenschange", onScreensChange as EventListener);
          attachedScreenDetails = details;
          detachScreensChangeListener = () => {
            details.removeEventListener("screenschange", onScreensChange as EventListener);
          };
        }
      } catch {
        // Browser denied multi-screen permission: fallback to coarse-grained detection when supported.
        if (checkScreenExtended()) reportMultiDisplayViolation();
      }
    };

    const handleVisibilityChange = async () => {
      if (document.visibilityState === "hidden") {
        lastVisibilityHiddenAtRef.current = Date.now();
        await emitViolation("tab_hidden", tRef.current("exam.tabHidden"));
      }
    };

    const handleInteraction = () => {
      const now = Date.now();
      lastInteractionTime.current = now;
      if (
        now - lastUserDisplayCheckAt.current <
        EXAM_MONITORING_USER_INTERACTION_DISPLAY_CHECK_COOLDOWN_MS
      ) {
        return;
      }
      lastUserDisplayCheckAt.current = now;
      void ensureSingleDisplay();
    };

    const handleBlur = () => {
      const timeSinceInteraction = Date.now() - lastInteractionTime.current;
      if (timeSinceInteraction < EXAM_MONITORING_BLUR_DEBOUNCE_MS) {
        return;
      }

      clearTimeout(blurCheckTimeoutRef.current);
      clearTimeout(blurConfirmTimeoutRef.current);

      blurCheckTimeoutRef.current = setTimeout(() => {
        blurCheckTimeoutRef.current = undefined;
        if (document.hasFocus()) {
          return;
        }

        // If tab-hidden was just reported, skip duplicated blur violation.
        if (
          Date.now() - lastVisibilityHiddenAtRef.current <
          EXAM_MONITORING_BLUR_SUPPRESSION_AFTER_TAB_HIDDEN_MS
        ) {
          return;
        }

        if (document.visibilityState === "hidden") {
          emitViolation("window_blur", tRef.current("exam.windowBlur"));
          return;
        }

        // Confirm sustained focus loss to avoid transient browser blur glitches.
        blurConfirmTimeoutRef.current = setTimeout(() => {
          blurConfirmTimeoutRef.current = undefined;
          if (document.hasFocus()) return;
          if (
            Date.now() - lastVisibilityHiddenAtRef.current <
            EXAM_MONITORING_BLUR_SUPPRESSION_AFTER_TAB_HIDDEN_MS
          ) {
            return;
          }
          emitViolation("window_blur", tRef.current("exam.windowBlur"));
        }, EXAM_MONITORING_BLUR_CONFIRM_DELAY_MS);
      }, EXAM_MONITORING_FOCUS_CHECK_DELAY_MS);
    };

    const handleFullscreenChange = async () => {
      if (isFullscreen()) {
        clearFullscreenRecoveryTracking();
        return;
      }
      startFullscreenRecoveryTracking();
    };

    const handleCopyPaste = (e: ClipboardEvent) => {
      // Allow if it's within a specific allowed input (you can refine this condition if needed)
      // For strict exams, we just block it.
      e.preventDefault();
      const action = e.type === "copy" ? "Copy" : e.type === "cut" ? "Cut" : "Paste";
      const messageKey = (e.type === "copy" || e.type === "cut") ? "exam.forbiddenCopy" : "exam.forbiddenPaste";
      onBlockedActionRef.current?.(tRef.current(messageKey, action + " is forbidden"));
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      onBlockedActionRef.current?.(
        tRef.current("exam.forbiddenContextMenu", "Context menu is forbidden")
      );
    };

    const interactionEvents = [
      "mousedown",
      "pointerdown",
      "click",
      "keydown",
      "keyup",
      "touchstart",
      "touchend",
      "focusin",
      "focusout",
      "input",
    ];
    interactionEvents.forEach((eventName) =>
      document.addEventListener(eventName, handleInteraction, true)
    );

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("copy", handleCopyPaste);
    document.addEventListener("cut", handleCopyPaste);
    document.addEventListener("paste", handleCopyPaste);
    document.addEventListener("contextmenu", handleContextMenu);

    void ensureSingleDisplay();
    const multiDisplayInterval = setInterval(() => {
      void ensureSingleDisplay();
    }, EXAM_MONITORING_MULTI_DISPLAY_CHECK_INTERVAL_MS);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("copy", handleCopyPaste);
      document.removeEventListener("cut", handleCopyPaste);
      document.removeEventListener("paste", handleCopyPaste);
      document.removeEventListener("contextmenu", handleContextMenu);
      interactionEvents.forEach((eventName) =>
        document.removeEventListener(eventName, handleInteraction, true)
      );

      clearInterval(multiDisplayInterval);
      if (detachScreensChangeListener) {
        detachScreensChangeListener();
      }
      clearFullscreenRecoveryTracking();
      clearTimeout(blurCheckTimeoutRef.current);
      clearTimeout(blurConfirmTimeoutRef.current);
      blurCheckTimeoutRef.current = undefined;
      blurConfirmTimeoutRef.current = undefined;
    };
  }, [enabled]);
}
