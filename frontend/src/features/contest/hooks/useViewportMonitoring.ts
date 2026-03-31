/**
 * useViewportMonitoring
 *
 * Viewport/split-view integrity detection.
 * Detection logic (polling, geometry, baseline, keyboard, tablet) lives here.
 * Timer/countdown/event-recording/force-submit is delegated to useViolationPipeline.
 */
import { useEffect, useMemo, useRef } from "react";
import { VIOLATION_ROUTES_MAP } from "@/features/contest/domain/violationRoutes";
import { useViolationPipeline } from "./useViolationPipeline";
import type { ForceSubmitRequest } from "./useForceSubmitArbiter";

const VIEWPORT_CHECK_INTERVAL_MS = 1_000;
const VIEWPORT_COVERAGE_MIN = 0.82;
const VIEWPORT_ASPECT_DELTA_MAX = 0.18;
const VIEWPORT_SCALE_TOLERANCE = 0.02;
const VIEWPORT_KEYBOARD_WIDTH_DELTA_MAX = 0.06;
const VIEWPORT_COVERAGE_MIN_TABLET = 0.92;
const VIEWPORT_ASPECT_DELTA_MAX_TABLET = 0.10;
const VIEWPORT_KEYBOARD_DISMISS_DEBOUNCE_MS = 1_500;
/** After returning from app switcher, Safari's visualViewport.scale can be
 *  transiently wrong (e.g. 1.03). Suppress checks during this settle window. */
const VIEWPORT_VISIBILITY_SETTLE_MS = 2_000;

interface ViewportSnapshot {
  width: number;
  height: number;
  scale: number;
  aspect: number;
  screenArea: number;
}

const getViewportSnapshot = (): ViewportSnapshot => {
  const viewport = window.visualViewport;
  const width = viewport?.width ?? window.innerWidth;
  const height = viewport?.height ?? window.innerHeight;
  const scale = viewport?.scale ?? 1;
  const screenW = window.screen.width || width;
  const screenH = window.screen.height || height;
  return {
    width,
    height,
    scale,
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

export interface UseViewportMonitoringConfig {
  contestId: string;
  enabled: boolean;
  examSubmitted: boolean;
  recoveryGraceMs?: number;
  isTablet: boolean;
  primarySourceModule: ForceSubmitRequest["sourceModule"];
  requestForceSubmit: (req: ForceSubmitRequest) => Promise<void>;
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
  requestForceSubmit,
}: UseViewportMonitoringConfig): UseViewportMonitoringReturn {
  const baselineRef = useRef<ViewportSnapshot | null>(null);
  const isTabletRef = useRef(isTablet);
  const primarySourceModuleRef = useRef(primarySourceModule);

  useEffect(() => { isTabletRef.current = isTablet; }, [isTablet]);
  useEffect(() => { primarySourceModuleRef.current = primarySourceModule; }, [primarySourceModule]);

  const route = VIOLATION_ROUTES_MAP["viewport"];

  const forceSubmitExtras = useMemo(() => ({
    sourceModule: primarySourceModule,
  }), [primarySourceModule]);

  const pipeline = useViolationPipeline({
    route,
    contestId,
    enabled,
    examSubmitted,
    recoveryGraceMs,
    moduleRole: "primary",
    requestForceSubmit,
    forceSubmitExtras,
  });
  const pipelineTriggerRef = useRef(pipeline.trigger);
  const pipelineRecoverRef = useRef(pipeline.recover);
  useEffect(() => {
    pipelineTriggerRef.current = pipeline.trigger;
    pipelineRecoverRef.current = pipeline.recover;
  }, [pipeline.trigger, pipeline.recover]);

  useEffect(() => {
    if (!enabled || examSubmitted) {
      baselineRef.current = null;
      return;
    }

    const resetBaseline = () => {
      baselineRef.current = getViewportSnapshot();
    };
    resetBaseline();

    // Track when text input was last focused to suppress false positives
    // during the brief transition when keyboard dismisses.
    let lastInputFocusedAt = 0;

    // Track when page becomes visible again — iOS Safari's viewport metrics
    // are unreliable for a brief moment after returning from app switcher.
    let lastVisibilityResumeAt = 0;
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        lastVisibilityResumeAt = Date.now();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    const evaluateViewportIntegrity = () => {
      const baseline = baselineRef.current;
      if (!baseline) { resetBaseline(); return; }

      const current = getViewportSnapshot();
      if (current.width <= 0 || current.height <= 0) return;

      // After returning from app switcher, Safari's visualViewport.scale can
      // transiently drift (e.g. 1.03→1.0). Skip checks during the settle window
      // and re-capture baseline once settled so stale pre-switch dimensions don't
      // cause a false positive.
      const sinceResume = Date.now() - lastVisibilityResumeAt;
      if (lastVisibilityResumeAt > 0 && sinceResume < VIEWPORT_VISIBILITY_SETTLE_MS) {
        return;
      }
      if (lastVisibilityResumeAt > 0 && sinceResume < VIEWPORT_VISIBILITY_SETTLE_MS + VIEWPORT_CHECK_INTERVAL_MS * 2) {
        // First evaluation after settle window — re-baseline.
        resetBaseline();
        lastVisibilityResumeAt = 0;
        return;
      }

      // --- Tablet + text input focused → skip entirely ---
      // The virtual keyboard can take 30-55% of the screen on iPad.
      // Any height-based threshold is fragile. But the threat model is clear:
      // split-view is for opening *another app*, which means focus leaves our
      // inputs. If focus is in a text input, the student is typing — not cheating.
      const inputFocused = isTextInputFocused();
      if (isTabletRef.current && inputFocused) {
        lastInputFocusedAt = Date.now();
        // If pipeline was interrupted (unlikely race), recover.
        pipelineRecoverRef.current("keyboard_input_focused", {
          coverage: 1,
          aspect_delta: 0,
          scale_delta: 0,
          keyboard_likely: true,
          is_tablet: true,
        });
        return;
      }

      // Brief grace after input loses focus — keyboard dismiss animation can
      // cause transient viewport changes.
      if (
        isTabletRef.current &&
        !inputFocused &&
        Date.now() - lastInputFocusedAt < VIEWPORT_KEYBOARD_DISMISS_DEBOUNCE_MS
      ) {
        return;
      }

      const currentArea = current.width * current.height;
      const baselineArea = Math.max(1, baseline.width * baseline.height);
      const coverageByScreen = currentArea / Math.max(1, current.screenArea);
      const coverageByBaseline = currentArea / baselineArea;
      const coverage = isTabletRef.current
        ? coverageByScreen
        : Math.min(coverageByScreen, coverageByBaseline);

      const aspectDelta =
        baseline.aspect > 0 ? Math.abs(current.aspect - baseline.aspect) / baseline.aspect : 0;
      const scaleDelta = Math.abs(current.scale - 1);

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
        (coverage < coverageMin ||
          aspectDelta > aspectMax ||
          scaleDelta > VIEWPORT_SCALE_TOLERANCE);

      const metadata = {
        reason: "viewport_integrity_violation",
        module: primarySourceModuleRef.current,
        coverage: Number(coverage.toFixed(4)),
        aspect_delta: Number(aspectDelta.toFixed(4)),
        scale_delta: Number(scaleDelta.toFixed(4)),
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
        scale_delta: 0,
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
