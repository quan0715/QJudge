/**
 * useMouseLeaveMonitoring
 *
 * Mouse-leave-window detection.
 * Detection logic (mouseleave/mouseenter + IME composition guard + cooldown) lives here.
 * Timer/countdown/event-recording is delegated to useViolationPipeline.
 */
import { useEffect, useRef } from "react";
import { VIOLATION_ROUTES_MAP } from "@/features/contest/domain/violationRoutes";
import { useViolationPipeline } from "./useViolationPipeline";
import type { ForceSubmitRequest } from "./useForceSubmitArbiter";

const IME_COMPOSITION_GUARD_MS = 900;

export interface UseMouseLeaveMonitoringConfig {
  contestId: string;
  enabled: boolean;
  isTablet?: boolean;
  examSubmitted: boolean;
  recoveryGraceMs?: number;
  cooldownMs?: number;
  onViolation: (eventType: string, reason: string) => void;
  requestForceSubmit: (req: ForceSubmitRequest) => Promise<void>;
}

export interface UseMouseLeaveMonitoringReturn {
  recoveryCountdown: number | null;
}

const mouseLeaveRoute = VIOLATION_ROUTES_MAP["mouse_leave"];

export function useMouseLeaveMonitoring({
  contestId,
  enabled,
  isTablet = false,
  examSubmitted,
  recoveryGraceMs,
  cooldownMs = 3000,
  onViolation,
  requestForceSubmit,
}: UseMouseLeaveMonitoringConfig): UseMouseLeaveMonitoringReturn {
  const effectiveEnabled = enabled && !isTablet;
  const pipeline = useViolationPipeline({
    route: mouseLeaveRoute,
    contestId,
    enabled: effectiveEnabled,
    examSubmitted,
    recoveryGraceMs,
    moduleRole: "primary",
    requestForceSubmit,
    onViolation,
  });

  const isComposingRef = useRef(false);
  const lastCompositionEndAtRef = useRef(0);
  const lastTriggerAtRef = useRef(0);

  useEffect(() => {
    if (!effectiveEnabled || examSubmitted) return;

    const handleMouseLeave = (e: MouseEvent) => {
      if (e.relatedTarget !== null) return;
      if (isComposingRef.current) return;
      if (Date.now() - lastCompositionEndAtRef.current < IME_COMPOSITION_GUARD_MS) return;
      if (pipeline.isInterrupted) return;

      const now = Date.now();
      if (now - lastTriggerAtRef.current < cooldownMs) return;
      lastTriggerAtRef.current = now;

      pipeline.trigger();
    };

    const handleMouseEnter = () => {
      pipeline.recover("mouse_returned");
    };

    const handleCompositionStart = () => {
      isComposingRef.current = true;
    };

    const handleCompositionEnd = () => {
      isComposingRef.current = false;
      lastCompositionEndAtRef.current = Date.now();
    };

    document.documentElement.addEventListener("mouseleave", handleMouseLeave);
    document.documentElement.addEventListener("mouseenter", handleMouseEnter);
    document.addEventListener("compositionstart", handleCompositionStart, true);
    document.addEventListener("compositionend", handleCompositionEnd, true);

    return () => {
      document.documentElement.removeEventListener("mouseleave", handleMouseLeave);
      document.documentElement.removeEventListener("mouseenter", handleMouseEnter);
      document.removeEventListener("compositionstart", handleCompositionStart, true);
      document.removeEventListener("compositionend", handleCompositionEnd, true);
    };
  }, [effectiveEnabled, examSubmitted, pipeline, cooldownMs]);

  return { recoveryCountdown: pipeline.recoveryCountdown };
}
