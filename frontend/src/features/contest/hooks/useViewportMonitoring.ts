/**
 * useViewportMonitoring
 *
 * Viewport/split-view integrity detection.
 * Detection logic (polling, geometry, baseline, keyboard, tablet) lives here.
 * Timer/countdown/event-recording/force-submit is delegated to useViolationPipeline.
 *
 * What we check: the overall window dimensions (width × height) relative to
 * the screen / baseline — this detects split-view and slide-over.
 * What we do NOT check: visualViewport.scale (content zoom). iOS frequently
 * reports transient scale drift (e.g. 1.03) after app-switching, which caused
 * false positives. Instead we lock out pinch-to-zoom via viewport meta +
 * touch-action during exam mode.
 */
import { useEffect, useMemo, useRef } from "react";
import { VIOLATION_ROUTES_MAP } from "@/features/contest/domain/violationRoutes";
import { useViolationPipeline } from "./useViolationPipeline";
import type { ForceSubmitRequest } from "./useForceSubmitArbiter";
import type { ForcedCaptureModule } from "@/features/contest/anticheat/forcedCapture";

const VIEWPORT_CHECK_INTERVAL_MS = 1_000;
const VIEWPORT_COVERAGE_MIN = 0.82;
const VIEWPORT_ASPECT_DELTA_MAX = 0.18;
const VIEWPORT_KEYBOARD_WIDTH_DELTA_MAX = 0.06;
const VIEWPORT_COVERAGE_MIN_TABLET = 0.92;
const VIEWPORT_ASPECT_DELTA_MAX_TABLET = 0.10;
const VIEWPORT_KEYBOARD_DISMISS_DEBOUNCE_MS = 1_500;
/** After returning from app switcher, Safari's viewport metrics can be
 *  transiently wrong. Desktop needs a shorter window; iPad needs longer
 *  because iOS animation + rendering pipeline adds latency. */
const VIEWPORT_VISIBILITY_SETTLE_MS = 2_000;
const VIEWPORT_VISIBILITY_SETTLE_MS_TABLET = 3_000;

interface ViewportSnapshot {
  width: number;
  height: number;
  aspect: number;
  screenArea: number;
}

const getViewportSnapshot = (): ViewportSnapshot => {
  // Use window.innerWidth/innerHeight — these reflect the layout viewport
  // (the overall app dimensions) and are NOT affected by pinch-to-zoom.
  // visualViewport.width/height shrink during pinch zoom, so we avoid them
  // to separate "app shape change" from "content zoom".
  const width = window.innerWidth;
  const height = window.innerHeight;
  const screenW = window.screen.width || width;
  const screenH = window.screen.height || height;
  return {
    width,
    height,
    aspect: width > 0 && height > 0 ? width / height : 1,
    screenArea: Math.max(1, screenW * screenH),
  };
};

const isTextInputFocused = (): boolean => {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return false;
  const tag = active.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || active.isContentEditable) return true;
  const role = (active.getAttribute("role") || "").toLowerCase();
  if (role === "textbox") return true;
  if ((active.getAttribute("aria-multiline") || "").toLowerCase() === "true") return true;
  return !!active.closest(".monaco-editor, .cm-editor, [contenteditable='true']");
};

// --- Pinch-to-zoom lockout during exam mode ---

const EXAM_VIEWPORT_META_CONTENT =
  "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no";
const ORIGINAL_VIEWPORT_META_CONTENT = "width=device-width, initial-scale=1.0";

const setViewportMeta = (content: string) => {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "viewport";
    document.head.appendChild(meta);
  }
  meta.content = content;
};

const lockPinchZoom = () => {
  setViewportMeta(EXAM_VIEWPORT_META_CONTENT);
  document.documentElement.style.touchAction = "manipulation";
};

const unlockPinchZoom = () => {
  setViewportMeta(ORIGINAL_VIEWPORT_META_CONTENT);
  document.documentElement.style.touchAction = "";
};

// --- Hook ---

export interface UseViewportMonitoringConfig {
  contestId: string;
  enabled: boolean;
  examSubmitted: boolean;
  recoveryGraceMs?: number;
  isTablet: boolean;
  primarySourceModule: ForceSubmitRequest["sourceModule"];
  evidenceCaptureModules?: ForcedCaptureModule[];
  requestForceSubmit: (req: ForceSubmitRequest) => Promise<void>;
  onViolation: (eventType: string, reason: string) => void;
}

export interface UseViewportMonitoringReturn {
  recoveryCountdown: number | null;
}

export function useViewportMonitoring({
  contestId,
  enabled,
  examSubmitted,
  recoveryGraceMs,
  isTablet,
  primarySourceModule,
  evidenceCaptureModules,
  requestForceSubmit,
  onViolation,
}: UseViewportMonitoringConfig): UseViewportMonitoringReturn {
  const baselineRef = useRef<ViewportSnapshot | null>(null);
  const isTabletRef = useRef(isTablet);
  const primarySourceModuleRef = useRef(primarySourceModule);

  useEffect(() => { isTabletRef.current = isTablet; }, [isTablet]);
  useEffect(() => { primarySourceModuleRef.current = primarySourceModule; }, [primarySourceModule]);

  const route = VIOLATION_ROUTES_MAP["viewport"];

  const forceSubmitExtras = useMemo(() => ({
    sourceModule: primarySourceModule,
    evidenceCaptureModules,
  }), [primarySourceModule, evidenceCaptureModules]);

  const pipeline = useViolationPipeline({
    route,
    contestId,
    enabled,
    examSubmitted,
    recoveryGraceMs,
    moduleRole: "primary",
    requestForceSubmit,
    onViolation,
    forceSubmitExtras,
  });
  const pipelineTriggerRef = useRef(pipeline.trigger);
  const pipelineRecoverRef = useRef(pipeline.recover);
  useEffect(() => {
    pipelineTriggerRef.current = pipeline.trigger;
    pipelineRecoverRef.current = pipeline.recover;
  }, [pipeline.trigger, pipeline.recover]);

  // Lock pinch-to-zoom while exam monitoring is active.
  useEffect(() => {
    if (!enabled || examSubmitted) return;
    lockPinchZoom();
    return unlockPinchZoom;
  }, [enabled, examSubmitted]);

  useEffect(() => {
    if (!enabled || examSubmitted) {
      baselineRef.current = null;
      return;
    }

    const resetBaseline = () => {
      baselineRef.current = getViewportSnapshot();
    };
    resetBaseline();

    let lastInputFocusedAt = 0;

    let lastVisibilityResumeAt = 0;
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        // App switch / lock screen — cancel any pending viewport countdown.
        // The brief resize that fires just before visibilitychange is NOT a
        // real split-view; it's the iOS app-switch animation. Recovering here
        // prevents the pipeline from escalating while the app is in background.
        pipelineRecoverRef.current("app_switch_hidden", {
          coverage: 1,
          aspect_delta: 0,
          keyboard_likely: false,
          is_tablet: isTabletRef.current,
        });
      } else if (document.visibilityState === "visible") {
        lastVisibilityResumeAt = Date.now();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    const evaluateViewportIntegrity = () => {
      const baseline = baselineRef.current;
      if (!baseline) { resetBaseline(); return; }

      const current = getViewportSnapshot();
      if (current.width <= 0 || current.height <= 0) return;

      // After returning from app switcher, viewport metrics can be transiently
      // wrong. Use a longer settle window on tablets (iOS animation latency).
      const settleMs = isTabletRef.current
        ? VIEWPORT_VISIBILITY_SETTLE_MS_TABLET
        : VIEWPORT_VISIBILITY_SETTLE_MS;
      const sinceResume = Date.now() - lastVisibilityResumeAt;
      if (lastVisibilityResumeAt > 0 && sinceResume < settleMs) {
        return;
      }
      if (lastVisibilityResumeAt > 0 && sinceResume < settleMs + VIEWPORT_CHECK_INTERVAL_MS * 2) {
        resetBaseline();
        lastVisibilityResumeAt = 0;
        return;
      }

      // --- Tablet + text input focused → skip entirely ---
      const inputFocused = isTextInputFocused();
      if (isTabletRef.current && inputFocused) {
        lastInputFocusedAt = Date.now();
        pipelineRecoverRef.current("keyboard_input_focused", {
          coverage: 1,
          aspect_delta: 0,
          keyboard_likely: true,
          is_tablet: true,
        });
        return;
      }

      // Brief grace after input loses focus — keyboard dismiss animation.
      if (
        isTabletRef.current &&
        !inputFocused &&
        Date.now() - lastInputFocusedAt < VIEWPORT_KEYBOARD_DISMISS_DEBOUNCE_MS
      ) {
        return;
      }

      // --- Geometry checks (window dimensions only, no content scale) ---
      const currentArea = current.width * current.height;
      const baselineArea = Math.max(1, baseline.width * baseline.height);
      const coverageByScreen = currentArea / Math.max(1, current.screenArea);
      const coverageByBaseline = currentArea / baselineArea;
      const coverage = isTabletRef.current
        ? coverageByScreen
        : Math.min(coverageByScreen, coverageByBaseline);

      const aspectDelta =
        baseline.aspect > 0 ? Math.abs(current.aspect - baseline.aspect) / baseline.aspect : 0;

      // Desktop keyboard guard: width stable + height shrunk + input focused.
      const desktopKeyboardLikely =
        !isTabletRef.current &&
        inputFocused &&
        Math.abs(current.width - baseline.width) / Math.max(1, baseline.width) < VIEWPORT_KEYBOARD_WIDTH_DELTA_MAX &&
        current.height < baseline.height * 0.98;

      const coverageMin = isTabletRef.current ? VIEWPORT_COVERAGE_MIN_TABLET : VIEWPORT_COVERAGE_MIN;
      const aspectMax = isTabletRef.current ? VIEWPORT_ASPECT_DELTA_MAX_TABLET : VIEWPORT_ASPECT_DELTA_MAX;
      const abnormal =
        !desktopKeyboardLikely &&
        (coverage < coverageMin || aspectDelta > aspectMax);

      const metadata = {
        reason: "viewport_integrity_violation",
        module: primarySourceModuleRef.current,
        coverage: Number(coverage.toFixed(4)),
        aspect_delta: Number(aspectDelta.toFixed(4)),
        keyboard_likely: desktopKeyboardLikely,
        is_tablet: isTabletRef.current,
      };

      if (abnormal) {
        pipelineTriggerRef.current(metadata);
      } else {
        pipelineRecoverRef.current("viewport_integrity_recovered", metadata);
      }
    };

    const onOrientationChange = () => {
      resetBaseline();
      pipelineRecoverRef.current("orientation_change", {
        coverage: 1,
        aspect_delta: 0,
        keyboard_likely: false,
      });
    };

    const intervalId = window.setInterval(evaluateViewportIntegrity, VIEWPORT_CHECK_INTERVAL_MS);
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", evaluateViewportIntegrity);
    window.addEventListener("resize", evaluateViewportIntegrity);
    window.addEventListener("orientationchange", onOrientationChange);

    evaluateViewportIntegrity();

    return () => {
      window.clearInterval(intervalId);
      viewport?.removeEventListener("resize", evaluateViewportIntegrity);
      window.removeEventListener("resize", evaluateViewportIntegrity);
      window.removeEventListener("orientationchange", onOrientationChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled, examSubmitted]);

  return { recoveryCountdown: pipeline.recoveryCountdown };
}
