import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { IntegrityJsonValue } from "@/core/entities/examIntegrity.entity";
import {
  ClipboardDetector,
  KeyboardShortcutDetector,
  PopupGuardDetector,
} from "@/features/contest/detectors";
import type { ExamDetector, ViolationEvent } from "@/features/contest/detectors";
import type { IntegritySignalEmitter } from "@/features/contest/anticheat/integrity/IntegrityRuntimeContext";

interface UseExamMonitoringProps {
  enabled: boolean;
  emitter: IntegritySignalEmitter;
  onBlockedAction?: (message: string) => void;
}

/** Detector setup stays in the browser; signal interpretation stays in Worker. */
export function useExamMonitoring({
  enabled,
  emitter,
  onBlockedAction,
}: UseExamMonitoringProps) {
  const { t } = useTranslation("contest");
  const emitterRef = useRef(emitter);
  const onBlockedActionRef = useRef(onBlockedAction);
  const tRef = useRef(t);

  useEffect(() => { emitterRef.current = emitter; }, [emitter]);
  useEffect(() => { onBlockedActionRef.current = onBlockedAction; }, [onBlockedAction]);
  useEffect(() => { tRef.current = t; }, [t]);

  useEffect(() => {
    if (!enabled) return;
    const handleViolation = (event: ViolationEvent) => {
      void emitterRef.current.emit({
        eventType: event.eventType,
        clientOccurredAtMs: Date.now(),
        payload: {
          reason: event.message,
          severity: event.severity,
          ...((event.metadata ?? {}) as Record<string, IntegrityJsonValue>),
        },
      });
      if (event.severity === "info") onBlockedActionRef.current?.(event.message);
    };
    const activeDetectors: ExamDetector[] = [
      new ClipboardDetector(tRef.current),
      new KeyboardShortcutDetector(tRef.current),
      new PopupGuardDetector(tRef.current),
    ];
    activeDetectors.forEach((detector) => detector.start(handleViolation));
    return () => activeDetectors.forEach((detector) => detector.stop());
  }, [enabled]);
}
