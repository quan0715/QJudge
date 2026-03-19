import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  EXAM_MONITORING_USER_INTERACTION_DISPLAY_CHECK_COOLDOWN_MS,
} from "@/features/contest/domain/examMonitoringPolicy";
import {
  FullscreenDetector,
  FocusDetector,
  MultiDisplayDetector,
  ClipboardDetector,
  KeyboardShortcutDetector,
  MouseLeaveDetector,
  PopupGuardDetector,
} from "@/features/contest/detectors";
import type { ViolationEvent, ExamDetector } from "@/features/contest/detectors";
import { isRuntimeScreenShareReauthActive } from "@/features/contest/anticheat/runtimeReauthState";

export type RecoverySource = "fullscreen" | "mouse-leave";

export interface ExamMonitoringDetectorToggles {
  fullscreen?: boolean;
  focus?: boolean;
  tabVisibility?: boolean;
  multiDisplay?: boolean;
  mouseLeave?: boolean;
}

interface UseExamMonitoringProps {
  contestId?: string;
  enabled: boolean;
  enforceFullscreen?: boolean;
  detectorPolicy?: ExamMonitoringDetectorToggles;
  onViolation: (eventType: string, reason: string) => Promise<void> | void;
  onBlockedAction?: (message: string) => void;
  onRecoveryCountdownChange?: (secondsLeft: number | null, source: RecoverySource) => void;
  /** Fire-and-forget trace events (P2, no penalty, no modal). */
  onTraceEvent?: (eventType: string, reason: string) => void;
}

export function useExamMonitoring({
  contestId,
  enabled,
  enforceFullscreen = true,
  detectorPolicy,
  onViolation,
  onBlockedAction,
  onRecoveryCountdownChange,
  onTraceEvent,
}: UseExamMonitoringProps) {
  const { t } = useTranslation("contest");
  const onViolationRef = useRef(onViolation);
  const onBlockedActionRef = useRef(onBlockedAction);
  const onRecoveryCountdownChangeRef = useRef(onRecoveryCountdownChange);
  const onTraceEventRef = useRef(onTraceEvent);
  const tRef = useRef(t);

  useEffect(() => { onViolationRef.current = onViolation; }, [onViolation]);
  useEffect(() => { onBlockedActionRef.current = onBlockedAction; }, [onBlockedAction]);
  useEffect(() => { onRecoveryCountdownChangeRef.current = onRecoveryCountdownChange; }, [onRecoveryCountdownChange]);
  useEffect(() => { onTraceEventRef.current = onTraceEvent; }, [onTraceEvent]);
  useEffect(() => { tRef.current = t; }, [t]);

  useEffect(() => {
    if (!enabled) return;

    const detectorToggles: Required<ExamMonitoringDetectorToggles> = {
      fullscreen: detectorPolicy?.fullscreen ?? true,
      focus: detectorPolicy?.focus ?? true,
      tabVisibility: detectorPolicy?.tabVisibility ?? true,
      multiDisplay: detectorPolicy?.multiDisplay ?? true,
      mouseLeave: detectorPolicy?.mouseLeave ?? true,
    };

    const emitViolation = (eventType: string, message: string) =>
      Promise.resolve(onViolationRef.current(eventType, message)).catch(() => undefined);

    const handleViolation = (event: ViolationEvent) => {
      if (isRuntimeScreenShareReauthActive(contestId)) {
        return;
      }
      if (event.severity === "info") {
        // Triggered events (grace-period start) → record silently as P2 trace
        if (event.eventType.endsWith("_triggered")) {
          onTraceEventRef.current?.(event.eventType, event.message);
          return;
        }
        onBlockedActionRef.current?.(event.message);
        return;
      }
      emitViolation(event.eventType, event.message);
    };

    // Wire up interaction-triggered display checks
    const multiDisplayDetector = detectorToggles.multiDisplay
      ? new MultiDisplayDetector(tRef.current)
      : null;
    const focusDetector =
      detectorToggles.focus || detectorToggles.tabVisibility
        ? new FocusDetector(tRef.current, {
            enableFocus: detectorToggles.focus,
            enableTabVisibility: detectorToggles.tabVisibility,
          })
        : null;
    let lastUserDisplayCheckAt = 0;
    if (focusDetector && multiDisplayDetector) {
      focusDetector.onInteraction(() => {
        const now = Date.now();
        if (now - lastUserDisplayCheckAt < EXAM_MONITORING_USER_INTERACTION_DISPLAY_CHECK_COOLDOWN_MS) return;
        lastUserDisplayCheckAt = now;
        multiDisplayDetector.triggerCheck();
      });
    }

    const activeDetectors: ExamDetector[] = [
      ...(enforceFullscreen
      && detectorToggles.fullscreen
        ? [
            new FullscreenDetector(tRef.current, {
              onCountdownChange: (s: number | null) =>
                onRecoveryCountdownChangeRef.current?.(s, "fullscreen"),
            }),
          ]
        : []),
      ...(multiDisplayDetector ? [multiDisplayDetector] : []),
      ...(focusDetector ? [focusDetector] : []),
      new ClipboardDetector(tRef.current),
      new KeyboardShortcutDetector(tRef.current),
      ...(detectorToggles.mouseLeave
        ? [
            new MouseLeaveDetector(tRef.current, {
              onCountdownChange: (s) => onRecoveryCountdownChangeRef.current?.(s, "mouse-leave"),
            }),
          ]
        : []),
      new PopupGuardDetector(tRef.current),
    ];

    activeDetectors.forEach((d) => d.start(handleViolation));

    // --- Listener integrity verification (every 10s) ---
    const VERIFY_INTERVAL_MS = 10_000;
    const verifyTimer = setInterval(() => {
      const token = typeof crypto?.randomUUID === "function"
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2, 15);
      const failed: string[] = [];
      for (const d of activeDetectors) {
        if (d.verifyIntegrity && !d.verifyIntegrity(token)) {
          failed.push(d.id);
        }
      }
      if (failed.length > 0) {
        emitViolation(
          "listener_tampered",
          `Listener integrity check failed: ${failed.join(", ")}`
        );
      }
    }, VERIFY_INTERVAL_MS);

    return () => {
      activeDetectors.forEach((d) => d.stop());
      clearInterval(verifyTimer);
    };
  }, [contestId, enabled, enforceFullscreen, detectorPolicy]);
}
