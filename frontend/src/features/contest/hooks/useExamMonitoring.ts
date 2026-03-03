import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

const BLUR_DEBOUNCE_MS = 200;
const FOCUS_CHECK_DELAY_MS = 50;
const MULTI_DISPLAY_CHECK_INTERVAL_MS = 5000;
const MULTI_DISPLAY_REPORT_COOLDOWN_MS = 15000;

interface ScreenDetailsLike extends EventTarget {
  screens?: unknown[];
}

type WindowWithScreenDetails = Window & {
  getScreenDetails?: () => Promise<ScreenDetailsLike>;
};

interface UseExamMonitoringProps {
  enabled: boolean;
  onViolation: (eventType: string, reason: string) => Promise<void> | void;
}

export function useExamMonitoring({ enabled, onViolation }: UseExamMonitoringProps) {
  const { t } = useTranslation("contest");
  const lastInteractionTime = useRef<number>(0);
  const lastMultiDisplayReportAt = useRef<number>(0);
  const blurCheckTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Track last interaction time to debounce blur events
  useEffect(() => {
    if (!enabled) return;

    const handleInteraction = () => {
      lastInteractionTime.current = Date.now();
    };

    const events = [
      "mousedown", "pointerdown", "click", "keydown", "keyup",
      "touchstart", "touchend", "focusin", "focusout", "input"
    ];

    events.forEach(e => document.addEventListener(e, handleInteraction, true));

    return () => {
      events.forEach(e => document.removeEventListener(e, handleInteraction, true));
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    let disposed = false;
    let screenDetails: ScreenDetailsLike | null = null;
    let detachScreensChangeListener: (() => void) | null = null;

    const reportMultiDisplayViolation = () => {
      const now = Date.now();
      if (now - lastMultiDisplayReportAt.current < MULTI_DISPLAY_REPORT_COOLDOWN_MS) {
        return;
      }
      lastMultiDisplayReportAt.current = now;
      Promise.resolve(
        onViolation(
          "multiple_displays",
          t(
            "exam.multipleDisplaysDetected",
            "Multiple displays detected. Please keep only one physical screen connected."
          )
        )
      ).catch(console.error);
    };

    const hasMultipleDisplays = (screens: unknown[] | undefined) =>
      Array.isArray(screens) && screens.length > 1;

    const checkScreenExtended = () => {
      const screenWithExtended = window.screen as Screen & { isExtended?: boolean };
      return screenWithExtended.isExtended === true;
    };

    const evaluateDisplays = (screens: unknown[] | undefined) => {
      if (hasMultipleDisplays(screens)) {
        reportMultiDisplayViolation();
      }
    };

    const ensureSingleDisplay = async () => {
      if (disposed) return;

      if (screenDetails) {
        evaluateDisplays(screenDetails.screens);
        return;
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

        if (typeof details.addEventListener === "function") {
          const onScreensChange = () => evaluateDisplays(screenDetails?.screens);
          details.addEventListener("screenschange", onScreensChange as EventListener);
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
        await onViolation("tab_hidden", t("exam.tabHidden"));
      }
    };

    const handleBlur = () => {
      const timeSinceInteraction = Date.now() - lastInteractionTime.current;
      if (timeSinceInteraction < BLUR_DEBOUNCE_MS) {
        return;
      }

      clearTimeout(blurCheckTimeoutRef.current);

      blurCheckTimeoutRef.current = setTimeout(() => {
        blurCheckTimeoutRef.current = undefined;
        if (!document.hasFocus()) {
          Promise.resolve(onViolation("window_blur", t("exam.windowBlur"))).catch(console.error);
        }
      }, FOCUS_CHECK_DELAY_MS);
    };

    const handleFullscreenChange = async () => {
      if (!document.fullscreenElement) {
        await onViolation("exit_fullscreen", t("exam.exitedFullscreen"));
      }
    };

    const handleCopyPaste = (e: ClipboardEvent) => {
      // Allow if it's within a specific allowed input (you can refine this condition if needed)
      // For strict exams, we just block it.
      e.preventDefault();
      const action = e.type === "copy" ? "Copy" : e.type === "cut" ? "Cut" : "Paste";
      const messageKey = (e.type === "copy" || e.type === "cut") ? "exam.forbiddenCopy" : "exam.forbiddenPaste";
      Promise.resolve(onViolation("forbidden_action", t(messageKey, action + " is forbidden"))).catch(console.error);
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      Promise.resolve(onViolation("forbidden_action", t("exam.forbiddenContextMenu", "Context menu is forbidden"))).catch(console.error);
    };

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
    }, MULTI_DISPLAY_CHECK_INTERVAL_MS);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("copy", handleCopyPaste);
      document.removeEventListener("cut", handleCopyPaste);
      document.removeEventListener("paste", handleCopyPaste);
      document.removeEventListener("contextmenu", handleContextMenu);

      clearInterval(multiDisplayInterval);
      if (detachScreensChangeListener) {
        detachScreensChangeListener();
      }
      clearTimeout(blurCheckTimeoutRef.current);
      blurCheckTimeoutRef.current = undefined;
    };
  }, [enabled, onViolation, t]);
}
