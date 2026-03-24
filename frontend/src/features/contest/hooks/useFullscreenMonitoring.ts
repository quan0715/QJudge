/**
 * useFullscreenMonitoring
 *
 * Fullscreen exit detection.
 * Detection logic (fullscreenchange + 100ms settlement) lives here.
 * Timer/countdown/event-recording is delegated to useViolationPipeline.
 */
import { useEffect, useRef } from "react";
import { isFullscreen } from "@/core/usecases/exam";
import { VIOLATION_ROUTES_MAP } from "@/features/contest/domain/violationRoutes";
import { useViolationPipeline } from "./useViolationPipeline";
import type { ForceSubmitRequest } from "./useForceSubmitArbiter";

const FULLSCREEN_SETTLEMENT_MS = 100;
const VERIFY_INTERVAL_MS = 10_000;

export interface UseFullscreenMonitoringConfig {
  contestId: string;
  enabled: boolean;
  examSubmitted: boolean;
  recoveryGraceMs?: number;
  onViolation: (eventType: string, reason: string) => void;
  requestForceSubmit: (req: ForceSubmitRequest) => Promise<void>;
}

export interface UseFullscreenMonitoringReturn {
  recoveryCountdown: number | null;
}

const fullscreenRoute = VIOLATION_ROUTES_MAP["fullscreen"];

export function useFullscreenMonitoring({
  contestId,
  enabled,
  examSubmitted,
  recoveryGraceMs,
  onViolation,
  requestForceSubmit,
}: UseFullscreenMonitoringConfig): UseFullscreenMonitoringReturn {
  const pipeline = useViolationPipeline({
    route: fullscreenRoute,
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

  const lastVerifyResponseRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || examSubmitted) return;

    const handleFullscreenChange = (event: Event) => {
      // Integrity verification token — not a real fullscreen change
      const verifyToken = (event as Event & { __examVerify?: string }).__examVerify;
      if (verifyToken) {
        lastVerifyResponseRef.current = verifyToken;
        return;
      }

      // Wait for browser to settle fullscreen state
      setTimeout(() => {
        if (isFullscreen()) {
          pipelineRef.current.recover("fullscreen_restored");
        } else {
          pipelineRef.current.trigger();
        }
      }, FULLSCREEN_SETTLEMENT_MS);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);

    // Listener integrity verification (every 10s)
    const verifyTimer = setInterval(() => {
      const token =
        typeof crypto?.randomUUID === "function"
          ? crypto.randomUUID()
          : Math.random().toString(36).substring(2, 15);

      lastVerifyResponseRef.current = null;
      const synthetic = new Event("fullscreenchange");
      (synthetic as Event & { __examVerify?: string }).__examVerify = token;
      document.dispatchEvent(synthetic);

      if (lastVerifyResponseRef.current !== token) {
        onViolation("listener_tampered", "Fullscreen listener integrity check failed");
      }
    }, VERIFY_INTERVAL_MS);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      clearInterval(verifyTimer);
    };
  }, [enabled, examSubmitted, onViolation]);

  return { recoveryCountdown: pipeline.recoveryCountdown };
}
