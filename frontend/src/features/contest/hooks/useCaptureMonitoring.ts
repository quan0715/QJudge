import { useCallback, useEffect, useRef, useState } from "react";
import type { IntegritySignalEmitter } from "@/features/contest/anticheat/integrity/IntegrityRuntimeContext";

type CaptureMonitoringConfig = {
  source: "screen_share" | "webcam";
  enabled: boolean;
  examSubmitted: boolean;
  moduleRole: string;
  emitter: IntegritySignalEmitter;
  monitoringDisabled?: boolean;
  streamActive?: boolean;
};

/** Capture sensors report observations; only the Worker determines penalties. */
export function useCaptureMonitoring({
  source, enabled, examSubmitted, moduleRole, emitter,
  monitoringDisabled = false, streamActive = false,
}: CaptureMonitoringConfig) {
  const [interrupted, setInterrupted] = useState(false);
  const latest = useRef({ emitter, moduleRole });
  useEffect(() => { latest.current = { emitter, moduleRole }; }, [emitter, moduleRole]);

  const emit = useCallback((phase: "interrupted" | "restored", reason: string) => {
    void latest.current.emitter.emit({
      eventType: `${source}_${phase}`,
      clientOccurredAtMs: Date.now(),
      payload: { reason, module: source, module_role: latest.current.moduleRole },
    });
  }, [source]);
  const onStreamLost = useCallback(() => {
    if (!enabled || examSubmitted) return;
    setInterrupted(true);
    emit("interrupted", "stream_ended");
  }, [emit, enabled, examSubmitted]);
  const onStreamRestored = useCallback((reason?: "user_reauthorized" | "stream_recovered") => {
    setInterrupted(false);
    emit("restored", reason ?? (source === "screen_share" ? "user_reshared" : "stream_recovered"));
  }, [emit, source]);

  // Webcam can recover automatically; screen sharing requires explicit re-sharing.
  useEffect(() => {
    if (source === "webcam" && interrupted && streamActive) onStreamRestored("stream_recovered");
  }, [source, interrupted, streamActive, onStreamRestored]);
  const monitoringOff = source === "screen_share" ? monitoringDisabled : !enabled;
  useEffect(() => {
    if (examSubmitted || monitoringOff) setInterrupted(false);
  }, [examSubmitted, monitoringOff]);

  return { interrupted, onStreamLost, onStreamRestored };
}
