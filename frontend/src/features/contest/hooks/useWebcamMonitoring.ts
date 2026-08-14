import { useCallback, useEffect, useRef, useState } from "react";
import type { IntegrityJsonValue } from "@/core/entities/examIntegrity.entity";
import type { IntegritySignalEmitter } from "@/features/contest/anticheat/integrity/IntegrityRuntimeContext";

export interface UseWebcamMonitoringConfig {
  enabled: boolean;
  examSubmitted: boolean;
  moduleRole: string;
  streamActive: boolean;
  emitter: IntegritySignalEmitter;
}

export interface UseWebcamMonitoringReturn {
  interrupted: boolean;
  onStreamLost: () => void;
  onStreamRestored: (reason?: "user_reauthorized" | "stream_recovered") => void;
}

export function useWebcamMonitoring({
  enabled,
  examSubmitted,
  moduleRole,
  streamActive,
  emitter,
}: UseWebcamMonitoringConfig): UseWebcamMonitoringReturn {
  const [interrupted, setInterrupted] = useState(false);
  const emitterRef = useRef(emitter);
  const moduleRoleRef = useRef(moduleRole);

  useEffect(() => {
    emitterRef.current = emitter;
  }, [emitter]);
  useEffect(() => {
    moduleRoleRef.current = moduleRole;
  }, [moduleRole]);
  const emit = useCallback((eventType: string, payload: Record<string, IntegrityJsonValue>) => {
    void emitterRef.current.emit({ eventType, clientOccurredAtMs: Date.now(), payload });
  }, []);
  const onStreamLost = useCallback(() => {
    if (!enabled || examSubmitted) return;
    setInterrupted(true);
    emit("webcam_interrupted", {
      reason: "stream_ended",
      module: "webcam",
      module_role: moduleRoleRef.current,
    });
  }, [emit, enabled, examSubmitted]);
  const onStreamRestored = useCallback(
    (reason: "user_reauthorized" | "stream_recovered" = "stream_recovered") => {
      setInterrupted(false);
      emit("webcam_restored", {
        reason,
        module: "webcam",
        module_role: moduleRoleRef.current,
      });
    },
    [emit],
  );
  useEffect(() => {
    if (interrupted && streamActive) onStreamRestored("stream_recovered");
  }, [interrupted, onStreamRestored, streamActive]);
  useEffect(() => {
    if (!enabled || examSubmitted) setInterrupted(false);
  }, [enabled, examSubmitted]);

  return { interrupted, onStreamLost, onStreamRestored };
}
