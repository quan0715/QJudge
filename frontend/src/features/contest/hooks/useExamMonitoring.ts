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
  const onViolationRef = useRef(onViolation);
  const onBlockedActionRef = useRef(onBlockedAction);
  const onFullscreenRecoveryCountdownChangeRef = useRef(onFullscreenRecoveryCountdownChange);
  const tRef = useRef(t);

  useEffect(() => { onViolationRef.current = onViolation; }, [onViolation]);
  useEffect(() => { onBlockedActionRef.current = onBlockedAction; }, [onBlockedAction]);
  useEffect(() => { onFullscreenRecoveryCountdownChangeRef.current = onFullscreenRecoveryCountdownChange; }, [onFullscreenRecoveryCountdownChange]);
  useEffect(() => { tRef.current = t; }, [t]);

  useEffect(() => {
    if (!enabled) return;

    const emitViolation = (eventType: string, message: string) =>
      Promise.resolve(onViolationRef.current(eventType, message)).catch(console.error);

    const handleViolation = (event: ViolationEvent) => {
      if (event.severity === "info") {
        onBlockedActionRef.current?.(event.message);
        return;
      }
      emitViolation(event.eventType, event.message);
    };

    // Wire up interaction-triggered display checks
    const multiDisplayDetector = new MultiDisplayDetector(tRef.current);
    const focusDetector = new FocusDetector(tRef.current);
    let lastUserDisplayCheckAt = 0;
    focusDetector.onInteraction(() => {
      const now = Date.now();
      if (now - lastUserDisplayCheckAt < EXAM_MONITORING_USER_INTERACTION_DISPLAY_CHECK_COOLDOWN_MS) return;
      lastUserDisplayCheckAt = now;
      multiDisplayDetector.triggerCheck();
    });

    const detectors: ExamDetector[] = [
      new FullscreenDetector(tRef.current, {
        onCountdownChange: (s) => onFullscreenRecoveryCountdownChangeRef.current?.(s),
      }),
      multiDisplayDetector,
      focusDetector,
      new ClipboardDetector(tRef.current),
      new KeyboardShortcutDetector(tRef.current),
      new MouseLeaveDetector(tRef.current),
      new PopupGuardDetector(tRef.current),
    ];

    detectors.forEach((d) => d.start(handleViolation));
    return () => detectors.forEach((d) => d.stop());
  }, [enabled]);
}
