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

export type RecoverySource = "fullscreen" | "mouse-leave";

interface UseExamMonitoringProps {
  enabled: boolean;
  onViolation: (eventType: string, reason: string) => Promise<void> | void;
  onBlockedAction?: (message: string) => void;
  onRecoveryCountdownChange?: (secondsLeft: number | null, source: RecoverySource) => void;
}

export function useExamMonitoring({
  enabled,
  onViolation,
  onBlockedAction,
  onRecoveryCountdownChange,
}: UseExamMonitoringProps) {
  const { t } = useTranslation("contest");
  const onViolationRef = useRef(onViolation);
  const onBlockedActionRef = useRef(onBlockedAction);
  const onRecoveryCountdownChangeRef = useRef(onRecoveryCountdownChange);
  const tRef = useRef(t);

  useEffect(() => { onViolationRef.current = onViolation; }, [onViolation]);
  useEffect(() => { onBlockedActionRef.current = onBlockedAction; }, [onBlockedAction]);
  useEffect(() => { onRecoveryCountdownChangeRef.current = onRecoveryCountdownChange; }, [onRecoveryCountdownChange]);
  useEffect(() => { tRef.current = t; }, [t]);

  useEffect(() => {
    if (!enabled) return;

    const emitViolation = (eventType: string, message: string) =>
      Promise.resolve(onViolationRef.current(eventType, message)).catch(() => undefined);

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
        onCountdownChange: (s) => onRecoveryCountdownChangeRef.current?.(s, "fullscreen"),
      }),
      multiDisplayDetector,
      focusDetector,
      new ClipboardDetector(tRef.current),
      new KeyboardShortcutDetector(tRef.current),
      new MouseLeaveDetector(tRef.current, {
        onCountdownChange: (s) => onRecoveryCountdownChangeRef.current?.(s, "mouse-leave"),
      }),
      new PopupGuardDetector(tRef.current),
    ];

    detectors.forEach((d) => d.start(handleViolation));
    return () => detectors.forEach((d) => d.stop());
  }, [enabled]);
}
