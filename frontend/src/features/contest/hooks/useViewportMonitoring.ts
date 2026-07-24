import { useEffect, useRef, useState } from "react";
import type { IntegrityJsonValue } from "@/core/entities/examIntegrity.entity";
import type { IntegritySignalEmitter } from "@/features/contest/anticheat/integrity/IntegrityRuntimeContext";

const VIEWPORT_CHECK_INTERVAL_MS = 1_000;
const VIEWPORT_COVERAGE_MIN = 0.82;
const VIEWPORT_ASPECT_DELTA_MAX = 0.18;
const VIEWPORT_KEYBOARD_WIDTH_DELTA_MAX = 0.06;
const VIEWPORT_COVERAGE_MIN_TABLET = 0.92;
const VIEWPORT_ASPECT_DELTA_MAX_TABLET = 0.10;
const VIEWPORT_KEYBOARD_DISMISS_DEBOUNCE_MS = 1_500;
const VIEWPORT_VISIBILITY_SETTLE_MS = 2_000;
const VIEWPORT_VISIBILITY_SETTLE_MS_TABLET = 3_000;

interface ViewportSnapshot {
  width: number;
  height: number;
  aspect: number;
  screenArea: number;
}

const getViewportSnapshot = (): ViewportSnapshot => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  return {
    width,
    height,
    aspect: width > 0 && height > 0 ? width / height : 1,
    screenArea: Math.max(1, (window.screen.width || width) * (window.screen.height || height)),
  };
};

const isTextInputFocused = (): boolean => {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return false;
  const tag = active.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || active.isContentEditable) return true;
  return active.getAttribute("role")?.toLowerCase() === "textbox" ||
    !!active.closest(".monaco-editor, .cm-editor, [contenteditable='true']");
};

const lockPinchZoom = () => {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "viewport";
    document.head.appendChild(meta);
  }
  meta.content = "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no";
  document.documentElement.style.touchAction = "manipulation";
};

const unlockPinchZoom = () => {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (meta) meta.content = "width=device-width, initial-scale=1.0";
  document.documentElement.style.touchAction = "";
};

export interface UseViewportMonitoringConfig {
  enabled: boolean;
  examSubmitted: boolean;
  isTablet: boolean;
  primarySourceModule: "screen_share" | "webcam";
  emitter: IntegritySignalEmitter;
}

export interface UseViewportMonitoringReturn {
  interrupted: boolean;
}

export function useViewportMonitoring({
  enabled,
  examSubmitted,
  isTablet,
  primarySourceModule,
  emitter,
}: UseViewportMonitoringConfig): UseViewportMonitoringReturn {
  const [interrupted, setInterrupted] = useState(false);
  const baselineRef = useRef<ViewportSnapshot | null>(null);
  const emitterRef = useRef(emitter);
  const isTabletRef = useRef(isTablet);
  const sourceRef = useRef(primarySourceModule);

  useEffect(() => { emitterRef.current = emitter; }, [emitter]);
  useEffect(() => { isTabletRef.current = isTablet; }, [isTablet]);
  useEffect(() => { sourceRef.current = primarySourceModule; }, [primarySourceModule]);
  useEffect(() => {
    if (!enabled || examSubmitted) return;
    lockPinchZoom();
    return unlockPinchZoom;
  }, [enabled, examSubmitted]);

  useEffect(() => {
    if (!enabled || examSubmitted) {
      baselineRef.current = null;
      setInterrupted(false);
      return;
    }
    const resetBaseline = () => {
      baselineRef.current = getViewportSnapshot();
    };
    resetBaseline();
    let lastInputFocusedAt = 0;
    let lastVisibilityResumeAt = 0;
    const emit = (eventType: string, payload: Record<string, IntegrityJsonValue>) => {
      void emitterRef.current.emit({ eventType, clientOccurredAtMs: Date.now(), payload });
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        setInterrupted(false);
      } else {
        lastVisibilityResumeAt = Date.now();
      }
    };
    const evaluate = () => {
      const baseline = baselineRef.current;
      if (!baseline) {
        resetBaseline();
        return;
      }
      const current = getViewportSnapshot();
      if (current.width <= 0 || current.height <= 0) return;
      const settleMs = isTabletRef.current
        ? VIEWPORT_VISIBILITY_SETTLE_MS_TABLET
        : VIEWPORT_VISIBILITY_SETTLE_MS;
      const sinceResume = Date.now() - lastVisibilityResumeAt;
      if (lastVisibilityResumeAt && sinceResume < settleMs) return;
      if (lastVisibilityResumeAt && sinceResume < settleMs + VIEWPORT_CHECK_INTERVAL_MS * 2) {
        resetBaseline();
        lastVisibilityResumeAt = 0;
        return;
      }
      const inputFocused = isTextInputFocused();
      if (isTabletRef.current && inputFocused) {
        lastInputFocusedAt = Date.now();
        return;
      }
      if (isTabletRef.current && Date.now() - lastInputFocusedAt < VIEWPORT_KEYBOARD_DISMISS_DEBOUNCE_MS) return;
      const currentArea = current.width * current.height;
      const coverageByScreen = currentArea / current.screenArea;
      const coverageByBaseline = currentArea / Math.max(1, baseline.width * baseline.height);
      const coverage = isTabletRef.current ? coverageByScreen : Math.min(coverageByScreen, coverageByBaseline);
      const aspectDelta = baseline.aspect > 0 ? Math.abs(current.aspect - baseline.aspect) / baseline.aspect : 0;
      const desktopKeyboardLikely = !isTabletRef.current && inputFocused &&
        Math.abs(current.width - baseline.width) / Math.max(1, baseline.width) < VIEWPORT_KEYBOARD_WIDTH_DELTA_MAX &&
        current.height < baseline.height * 0.98;
      const abnormal = !desktopKeyboardLikely && (
        coverage < (isTabletRef.current ? VIEWPORT_COVERAGE_MIN_TABLET : VIEWPORT_COVERAGE_MIN) ||
        aspectDelta > (isTabletRef.current ? VIEWPORT_ASPECT_DELTA_MAX_TABLET : VIEWPORT_ASPECT_DELTA_MAX)
      );
      const payload = {
        module: sourceRef.current,
        coverage: Number(coverage.toFixed(4)),
        aspect_delta: Number(aspectDelta.toFixed(4)),
        keyboard_likely: desktopKeyboardLikely,
        is_tablet: isTabletRef.current,
      };
      setInterrupted(abnormal);
      emit(abnormal ? "viewport_interrupted" : "viewport_restored", payload);
    };
    const onOrientationChange = () => {
      resetBaseline();
      setInterrupted(false);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    const interval = window.setInterval(evaluate, VIEWPORT_CHECK_INTERVAL_MS);
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", evaluate);
    window.addEventListener("resize", evaluate);
    window.addEventListener("orientationchange", onOrientationChange);
    evaluate();
    return () => {
      window.clearInterval(interval);
      viewport?.removeEventListener("resize", evaluate);
      window.removeEventListener("resize", evaluate);
      window.removeEventListener("orientationchange", onOrientationChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled, examSubmitted]);

  return { interrupted };
}
