import { useCallback, useEffect, useRef, useState } from "react";
import type { IntegrityJsonValue } from "@/core/entities/examIntegrity.entity";
import type { IntegritySignalEmitter } from "@/features/contest/anticheat/integrity/IntegrityRuntimeContext";

export interface RuntimeReauthSnapshot {
  active: boolean;
  inProgress: boolean;
  remainingSeconds: null;
}

export interface UseScreenShareMonitoringConfig {
  enabled: boolean;
  examSubmitted: boolean;
  monitoringDisabled: boolean;
  moduleRole: string;
  emitter: IntegritySignalEmitter;
}

export interface UseScreenShareMonitoringReturn {
  onStreamLost: () => void;
  onStreamRestored: () => void;
  reauth: RuntimeReauthSnapshot;
}

/** Sensor state powers the re-share UI; only the Worker determines outcomes. */
export function useScreenShareMonitoring({
  enabled,
  examSubmitted,
  monitoringDisabled,
  moduleRole,
  emitter,
}: UseScreenShareMonitoringConfig): UseScreenShareMonitoringReturn {
  const [interrupted, setInterrupted] = useState(false);
  const emitterRef = useRef(emitter);
  const moduleRoleRef = useRef(moduleRole);

  useEffect(() => {
    emitterRef.current = emitter;
  }, [emitter]);
  useEffect(() => {
    moduleRoleRef.current = moduleRole;
  }, [moduleRole]);
  useEffect(() => {
    if (examSubmitted || monitoringDisabled) setInterrupted(false);
  }, [examSubmitted, monitoringDisabled]);

  const emit = useCallback((eventType: string, payload: Record<string, IntegrityJsonValue>) => {
    void emitterRef.current.emit({
      eventType,
      clientOccurredAtMs: Date.now(),
      payload,
    });
  }, []);
  const onStreamLost = useCallback(() => {
    if (!enabled || examSubmitted) return;
    setInterrupted(true);
    emit("screen_share_interrupted", {
      reason: "stream_ended",
      module: "screen_share",
      module_role: moduleRoleRef.current,
    });
  }, [emit, enabled, examSubmitted]);
  const onStreamRestored = useCallback(() => {
    setInterrupted(false);
    emit("screen_share_restored", {
      reason: "user_reshared",
      module: "screen_share",
      module_role: moduleRoleRef.current,
    });
  }, [emit]);

  return {
    onStreamLost,
    onStreamRestored,
    reauth: {
      active: interrupted,
      inProgress: interrupted,
      remainingSeconds: null,
    },
  };
}
