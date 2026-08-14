import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { IntegrityJsonValue } from "@/core/entities/examIntegrity.entity";
import { MultiDisplayDetector } from "@/features/contest/detectors";
import type { ViolationEvent } from "@/features/contest/detectors";
import type { IntegritySignalEmitter } from "@/features/contest/anticheat/integrity/IntegrityRuntimeContext";

export interface UseMultiDisplayMonitoringConfig {
  enabled: boolean;
  examSubmitted: boolean;
  emitter: IntegritySignalEmitter;
}

export interface UseMultiDisplayMonitoringReturn {
  interrupted: boolean;
  triggerCheck: () => void;
}

export function useMultiDisplayMonitoring({
  enabled,
  examSubmitted,
  emitter,
}: UseMultiDisplayMonitoringConfig): UseMultiDisplayMonitoringReturn {
  const { t } = useTranslation("contest");
  const [interrupted, setInterrupted] = useState(false);
  const detectorRef = useRef<MultiDisplayDetector | null>(null);
  const emitterRef = useRef(emitter);
  const tRef = useRef(t);

  useEffect(() => {
    emitterRef.current = emitter;
  }, [emitter]);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const triggerCheck = useCallback(() => {
    detectorRef.current?.triggerCheck();
  }, []);

  useEffect(() => {
    if (!enabled || examSubmitted) {
      setInterrupted(false);
      return;
    }
    const detector = new MultiDisplayDetector(tRef.current);
    detectorRef.current = detector;
    const emit = (eventType: string, payload: Record<string, IntegrityJsonValue>) => {
      void emitterRef.current.emit({ eventType, clientOccurredAtMs: Date.now(), payload });
    };
    const onViolation = (event: ViolationEvent) => {
      if (event.eventType === "multiple_displays") {
        setInterrupted(true);
        emit("multi_display_triggered", {
          reason: event.message,
          ...((event.metadata ?? {}) as Record<string, IntegrityJsonValue>),
        });
        return;
      }
    };
    detector.onApiHealthChange((status, reason) => {
      emitterRef.current.updateHealth?.({
        component: "display_api",
        status,
        ...(reason ? { reason } : {}),
      });
    });
    detector.onResolved(() => {
      setInterrupted(false);
      emit("multi_display_restored", { reason: "single_display_restored" });
    });
    detector.start(onViolation);
    return () => {
      detector.stop();
      detectorRef.current = null;
    };
  }, [enabled, examSubmitted]);

  return { interrupted, triggerCheck };
}
