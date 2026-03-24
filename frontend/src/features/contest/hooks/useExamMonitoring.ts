import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  ClipboardDetector,
  KeyboardShortcutDetector,
  PopupGuardDetector,
} from "@/features/contest/detectors";
import type { ViolationEvent, ExamDetector } from "@/features/contest/detectors";
import { isRuntimeScreenShareReauthActive } from "@/features/contest/anticheat/runtimeReauthState";

interface UseExamMonitoringProps {
  contestId?: string;
  enabled: boolean;
  onViolation: (eventType: string, reason: string) => Promise<void> | void;
  onBlockedAction?: (message: string) => void;
}

export function useExamMonitoring({
  contestId,
  enabled,
  onViolation,
  onBlockedAction,
}: UseExamMonitoringProps) {
  const { t } = useTranslation("contest");
  const onViolationRef = useRef(onViolation);
  const onBlockedActionRef = useRef(onBlockedAction);
  const tRef = useRef(t);

  useEffect(() => { onViolationRef.current = onViolation; }, [onViolation]);
  useEffect(() => { onBlockedActionRef.current = onBlockedAction; }, [onBlockedAction]);
  useEffect(() => { tRef.current = t; }, [t]);

  useEffect(() => {
    if (!enabled) return;

    const handleViolation = (event: ViolationEvent) => {
      if (isRuntimeScreenShareReauthActive(contestId)) {
        return;
      }
      if (event.severity === "info") {
        onBlockedActionRef.current?.(event.message);
        return;
      }
      Promise.resolve(onViolationRef.current(event.eventType, event.message)).catch(() => undefined);
    };

    const activeDetectors: ExamDetector[] = [
      new ClipboardDetector(tRef.current),
      new KeyboardShortcutDetector(tRef.current),
      new PopupGuardDetector(tRef.current),
    ];

    activeDetectors.forEach((d) => d.start(handleViolation));

    return () => {
      activeDetectors.forEach((d) => d.stop());
    };
  }, [contestId, enabled]);
}
