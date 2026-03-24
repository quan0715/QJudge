/**
 * useMultiDisplayMonitoring
 *
 * Multi-display detection via MultiDisplayDetector with grace-period pipeline.
 * Recovery: detector.onResolved → pipeline.recover("single_display_restored")
 */
import { useCallback, useEffect, useRef } from "react";
import { VIOLATION_ROUTES_MAP } from "@/features/contest/domain/violationRoutes";
import { EXAM_MONITORING_USER_INTERACTION_DISPLAY_CHECK_COOLDOWN_MS } from "@/features/contest/domain/examMonitoringPolicy";
import { MultiDisplayDetector } from "@/features/contest/detectors";
import type { ViolationEvent } from "@/features/contest/detectors";
import { recordExamEvent } from "@/infrastructure/api/repositories";
import { useViolationPipeline } from "./useViolationPipeline";
import type { ForceSubmitRequest } from "./useForceSubmitArbiter";
import { useTranslation } from "react-i18next";

export interface UseMultiDisplayMonitoringConfig {
  contestId: string;
  enabled: boolean;
  examSubmitted: boolean;
  recoveryGraceMs?: number;
  onViolation: (eventType: string, reason: string) => void;
  requestForceSubmit: (req: ForceSubmitRequest) => Promise<void>;
}

export interface UseMultiDisplayMonitoringReturn {
  recoveryCountdown: number | null;
  triggerCheck: () => void;
}

const multiDisplayRoute = VIOLATION_ROUTES_MAP["multiple_displays"];

export function useMultiDisplayMonitoring({
  contestId,
  enabled,
  examSubmitted,
  recoveryGraceMs,
  onViolation,
  requestForceSubmit,
}: UseMultiDisplayMonitoringConfig): UseMultiDisplayMonitoringReturn {
  const { t } = useTranslation("contest");
  const tRef = useRef(t);
  useEffect(() => { tRef.current = t; }, [t]);

  const pipeline = useViolationPipeline({
    route: multiDisplayRoute,
    contestId,
    enabled,
    examSubmitted,
    recoveryGraceMs,
    moduleRole: "primary",
    requestForceSubmit,
    onViolation,
  });

  const pipelineRef = useRef(pipeline);
  useEffect(() => { pipelineRef.current = pipeline; }, [pipeline]);

  const detectorRef = useRef<MultiDisplayDetector | null>(null);
  const lastInteractionCheckRef = useRef(0);

  const triggerCheck = useCallback(() => {
    const now = Date.now();
    if (now - lastInteractionCheckRef.current < EXAM_MONITORING_USER_INTERACTION_DISPLAY_CHECK_COOLDOWN_MS) return;
    lastInteractionCheckRef.current = now;
    detectorRef.current?.triggerCheck();
  }, []);

  useEffect(() => {
    if (!enabled || examSubmitted) return;

    const detector = new MultiDisplayDetector(tRef.current);
    detectorRef.current = detector;

    const handleDetectorViolation = (event: ViolationEvent) => {
      if (event.eventType === "multiple_displays") {
        pipelineRef.current.trigger();
      } else if (event.eventType === "display_api_degraded") {
        // Trace event only — do not walk pipeline
        recordExamEvent(contestId, "display_api_degraded", {
          source: "anticheat:multi_display",
          metadata: { reason: event.message },
        }).catch(() => null);
      }
    };

    detector.onResolved(() => {
      pipelineRef.current.recover("single_display_restored");
    });

    detector.start(handleDetectorViolation);

    return () => {
      detector.stop();
      detectorRef.current = null;
    };
  }, [enabled, examSubmitted, contestId]);

  return {
    recoveryCountdown: pipeline.recoveryCountdown,
    triggerCheck,
  };
}
