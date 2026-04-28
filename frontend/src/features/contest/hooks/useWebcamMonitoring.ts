/**
 * useWebcamMonitoring
 *
 * Webcam stream loss / recovery handling.
 * Detection (onStreamLost/onStreamRestored/streamActive auto-restore) lives here.
 * Timer/countdown/event-recording/force-submit is delegated to useViolationPipeline.
 */
import { useCallback, useEffect } from "react";
import { VIOLATION_ROUTES_MAP } from "@/features/contest/domain/violationRoutes";
import { useViolationPipeline } from "./useViolationPipeline";
import type { ForceSubmitRequest } from "./useForceSubmitArbiter";
import type { ForcedCaptureModule } from "@/features/contest/anticheat/forcedCapture";

export interface UseWebcamMonitoringConfig {
  contestId: string;
  enabled: boolean;
  examSubmitted: boolean;
  isPrimary: boolean;
  moduleRole: string;
  recoveryGraceMs?: number;
  evidenceCaptureModules?: ForcedCaptureModule[];
  streamActive: boolean;
  requestForceSubmit: (req: ForceSubmitRequest) => Promise<void>;
  onViolation: (eventType: string, reason: string) => void;
}

export interface UseWebcamMonitoringReturn {
  recoveryCountdown: number | null;
  onStreamLost: () => void;
  onStreamRestored: (reason?: "user_reauthorized" | "stream_recovered") => void;
}

const webcamRoute = VIOLATION_ROUTES_MAP["webcam"];

export function useWebcamMonitoring({
  contestId,
  enabled,
  examSubmitted,
  isPrimary,
  moduleRole,
  recoveryGraceMs,
  evidenceCaptureModules,
  streamActive,
  requestForceSubmit,
  onViolation,
}: UseWebcamMonitoringConfig): UseWebcamMonitoringReturn {
  const pipeline = useViolationPipeline({
    route: webcamRoute,
    contestId,
    enabled,
    examSubmitted,
    recoveryGraceMs,
    escalationOverride: isPrimary ? undefined : "log_only",
    moduleRole,
    requestForceSubmit,
    onViolation,
    forceSubmitExtras: {
      sourceModule: "webcam",
      evidenceCaptureModules,
      stopCaptureKey: "manual",
      stopWebcamFirst: true,
    },
  });

  const onStreamLost = useCallback(() => {
    pipeline.trigger({ reason: "stream_ended" });
  }, [pipeline]);

  const onStreamRestored = useCallback(
    (reason: "user_reauthorized" | "stream_recovered" = "stream_recovered") => {
      pipeline.recover(reason);
    },
    [pipeline],
  );

  // Auto-detect restore when stream becomes active again
  useEffect(() => {
    if (!pipeline.isInterrupted) return;
    if (!streamActive) return;
    onStreamRestored("stream_recovered");
  }, [streamActive, pipeline.isInterrupted, onStreamRestored]);

  return {
    recoveryCountdown: pipeline.recoveryCountdown,
    onStreamLost,
    onStreamRestored,
  };
}
