/**
 * useFocusMonitoring
 *
 * Tab-hidden and window-blur detection via FocusDetector,
 * with grace-period pipelines for both violation types.
 * Recovery: visibilitychange→visible recovers tab_hidden, window focus recovers window_blur.
 */
import { useCallback, useEffect, useRef } from "react";
import { VIOLATION_ROUTES_MAP } from "@/features/contest/domain/violationRoutes";
import { FocusDetector } from "@/features/contest/detectors";
import type { ViolationEvent } from "@/features/contest/detectors";
import { useViolationPipeline } from "./useViolationPipeline";
import type { ForceSubmitRequest } from "./useForceSubmitArbiter";
import { useTranslation } from "react-i18next";

const VERIFY_INTERVAL_MS = 10_000;

export interface UseFocusMonitoringConfig {
  contestId: string;
  enabled: boolean;
  examSubmitted: boolean;
  enableFocus?: boolean;
  enableTabVisibility?: boolean;
  recoveryGraceMs?: number;
  onViolation: (eventType: string, reason: string) => void;
  requestForceSubmit: (req: ForceSubmitRequest) => Promise<void>;
  onInteraction?: () => void;
}

export interface UseFocusMonitoringReturn {
  tabHiddenCountdown: number | null;
  windowBlurCountdown: number | null;
}

const tabHiddenRoute = VIOLATION_ROUTES_MAP["tab_hidden"];
const windowBlurRoute = VIOLATION_ROUTES_MAP["window_blur"];

export function useFocusMonitoring({
  contestId,
  enabled,
  examSubmitted,
  enableFocus = true,
  enableTabVisibility = true,
  recoveryGraceMs,
  onViolation,
  requestForceSubmit,
  onInteraction,
}: UseFocusMonitoringConfig): UseFocusMonitoringReturn {
  const { t } = useTranslation("contest");
  const tRef = useRef(t);
  useEffect(() => { tRef.current = t; }, [t]);

  const onInteractionRef = useRef(onInteraction);
  useEffect(() => { onInteractionRef.current = onInteraction; }, [onInteraction]);

  const effectiveTabEnabled = enabled && enableTabVisibility;
  const effectiveBlurEnabled = enabled && enableFocus;

  const tabHiddenPipeline = useViolationPipeline({
    route: tabHiddenRoute,
    contestId,
    enabled: effectiveTabEnabled,
    examSubmitted,
    recoveryGraceMs,
    moduleRole: "primary",
    requestForceSubmit,
    onViolation,
  });

  const windowBlurPipeline = useViolationPipeline({
    route: windowBlurRoute,
    contestId,
    enabled: effectiveBlurEnabled,
    examSubmitted,
    recoveryGraceMs,
    moduleRole: "primary",
    requestForceSubmit,
    onViolation,
  });

  const tabHiddenPipelineRef = useRef(tabHiddenPipeline);
  const windowBlurPipelineRef = useRef(windowBlurPipeline);
  useEffect(() => { tabHiddenPipelineRef.current = tabHiddenPipeline; }, [tabHiddenPipeline]);
  useEffect(() => { windowBlurPipelineRef.current = windowBlurPipeline; }, [windowBlurPipeline]);

  // Recovery listeners at hook level
  const handleVisibilityRecover = useCallback(() => {
    if (document.visibilityState === "visible") {
      tabHiddenPipelineRef.current.recover("tab_visible");
    }
  }, []);

  const handleFocusRecover = useCallback(() => {
    windowBlurPipelineRef.current.recover("window_focused");
  }, []);

  useEffect(() => {
    if (!enabled || examSubmitted) return;

    const detector = new FocusDetector(tRef.current, {
      enableFocus,
      enableTabVisibility,
    });

    // Wire interaction callback for display check
    if (onInteractionRef.current) {
      detector.onInteraction(() => {
        onInteractionRef.current?.();
      });
    }

    const handleDetectorViolation = (event: ViolationEvent) => {
      if (event.eventType === "tab_hidden") {
        tabHiddenPipelineRef.current.trigger();
      } else if (event.eventType === "window_blur") {
        windowBlurPipelineRef.current.trigger();
      }
    };

    detector.start(handleDetectorViolation);

    // Recovery listeners
    document.addEventListener("visibilitychange", handleVisibilityRecover);
    window.addEventListener("focus", handleFocusRecover);

    // Listener integrity verification (every 10s)
    const verifyTimer = setInterval(() => {
      const token = crypto.randomUUID();
      if (detector.verifyIntegrity && !detector.verifyIntegrity(token)) {
        onViolation("listener_tampered", "Focus listener integrity check failed: focus");
      }
    }, VERIFY_INTERVAL_MS);

    return () => {
      detector.stop();
      document.removeEventListener("visibilitychange", handleVisibilityRecover);
      window.removeEventListener("focus", handleFocusRecover);
      clearInterval(verifyTimer);
    };
  }, [enabled, examSubmitted, enableFocus, enableTabVisibility, handleVisibilityRecover, handleFocusRecover, onViolation]);

  return {
    tabHiddenCountdown: tabHiddenPipeline.recoveryCountdown,
    windowBlurCountdown: windowBlurPipeline.recoveryCountdown,
  };
}
