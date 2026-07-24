import { useEffect, useRef, useState } from "react";
import type { IntegrityJsonValue } from "@/core/entities/examIntegrity.entity";
import { isFullscreen } from "@/core/usecases/exam";
import type { IntegritySignalEmitter } from "@/features/contest/anticheat/integrity/IntegrityRuntimeContext";

const FULLSCREEN_SETTLEMENT_MS = 100;
const VERIFY_INTERVAL_MS = 10_000;

export interface UseFullscreenMonitoringConfig {
  enabled: boolean;
  examSubmitted: boolean;
  emitter: IntegritySignalEmitter;
}

export interface UseFullscreenMonitoringReturn {
  interrupted: boolean;
}

/** Browser observation only. The Worker owns fullscreen grace and actions. */
export function useFullscreenMonitoring({
  enabled,
  examSubmitted,
  emitter,
}: UseFullscreenMonitoringConfig): UseFullscreenMonitoringReturn {
  const [interrupted, setInterrupted] = useState(false);
  const emitterRef = useRef(emitter);

  useEffect(() => {
    emitterRef.current = emitter;
  }, [emitter]);

  useEffect(() => {
    if (!enabled || examSubmitted) {
      setInterrupted(false);
      return;
    }

    const emit = (eventType: string, payload: Record<string, IntegrityJsonValue> = {}) => {
      void emitterRef.current.emit({
        eventType,
        clientOccurredAtMs: Date.now(),
        payload,
      });
    };
    const handleFullscreenChange = (event: Event) => {
      const verifyToken = (event as Event & { __examVerify?: string }).__examVerify;
      if (verifyToken) {
        lastVerifyResponseRef.current = verifyToken;
        return;
      }
      window.setTimeout(() => {
        const fullscreen = isFullscreen();
        setInterrupted(!fullscreen);
        emit(fullscreen ? "fullscreen_restored" : "exit_fullscreen_triggered", {
          fullscreen,
        });
      }, FULLSCREEN_SETTLEMENT_MS);
    };
    const lastVerifyResponseRef = { current: null as string | null };
    const verifyTimer = window.setInterval(() => {
      const token = crypto.randomUUID();
      lastVerifyResponseRef.current = null;
      const synthetic = new Event("fullscreenchange") as Event & { __examVerify?: string };
      synthetic.__examVerify = token;
      document.dispatchEvent(synthetic);
      if (lastVerifyResponseRef.current !== token) {
        emit("listener_tampered", { listener: "fullscreenchange" });
      }
    }, VERIFY_INTERVAL_MS);

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      window.clearInterval(verifyTimer);
    };
  }, [enabled, examSubmitted]);

  return { interrupted };
}
