import { useEffect, useRef, useState } from "react";
import type { IntegrityJsonValue } from "@/core/entities/examIntegrity.entity";
import type { IntegritySignalEmitter } from "@/features/contest/anticheat/integrity/IntegrityRuntimeContext";

const IME_COMPOSITION_GUARD_MS = 900;
const POINTER_IDLE_THRESHOLD_MS = 2_000;
const MOUSE_LEAVE_EVIDENCE_WINDOW_SECONDS = 3;

export interface UseMouseLeaveMonitoringConfig {
  enabled: boolean;
  isTablet?: boolean;
  supportsFinePointer?: boolean;
  examSubmitted: boolean;
  emitter: IntegritySignalEmitter;
}

export interface UseMouseLeaveMonitoringReturn {
  interrupted: boolean;
}

/** Keeps pointer sensor filtering local, but delegates every policy decision. */
export function useMouseLeaveMonitoring({
  enabled,
  isTablet = false,
  supportsFinePointer = false,
  examSubmitted,
  emitter,
}: UseMouseLeaveMonitoringConfig): UseMouseLeaveMonitoringReturn {
  const [interrupted, setInterrupted] = useState(false);
  const emitterRef = useRef(emitter);
  const isComposingRef = useRef(false);
  const lastCompositionEndAtRef = useRef(0);
  const lastMouseMoveAtRef = useRef(0);

  useEffect(() => {
    emitterRef.current = emitter;
  }, [emitter]);

  const effectiveEnabled = enabled && (!isTablet || supportsFinePointer);
  useEffect(() => {
    if (!effectiveEnabled || examSubmitted) {
      setInterrupted(false);
      return;
    }
    lastMouseMoveAtRef.current = Date.now();
    const emit = (eventType: string, payload: Record<string, IntegrityJsonValue>) => {
      void emitterRef.current.emit({
        eventType,
        clientOccurredAtMs: Date.now(),
        payload,
      });
    };
    const handleMouseMove = () => {
      lastMouseMoveAtRef.current = Date.now();
    };
    const handleMouseLeave = (event: MouseEvent) => {
      if (event.relatedTarget !== null) return;
      const now = Date.now();
      if (now - lastMouseMoveAtRef.current > POINTER_IDLE_THRESHOLD_MS) return;
      if (isComposingRef.current || now - lastCompositionEndAtRef.current < IME_COMPOSITION_GUARD_MS) return;
      setInterrupted(true);
      emit("mouse_leave_triggered", {
        reason: "mouse_left_exam_window",
        evidence_window_before_seconds: MOUSE_LEAVE_EVIDENCE_WINDOW_SECONDS,
        evidence_window_after_seconds: MOUSE_LEAVE_EVIDENCE_WINDOW_SECONDS,
      });
    };
    const handleMouseEnter = () => {
      lastMouseMoveAtRef.current = Date.now();
      setInterrupted(false);
      emit("mouse_leave_restored", { reason: "mouse_returned" });
    };
    const handleCompositionStart = () => {
      isComposingRef.current = true;
    };
    const handleCompositionEnd = () => {
      isComposingRef.current = false;
      lastCompositionEndAtRef.current = Date.now();
    };
    document.documentElement.addEventListener("mousemove", handleMouseMove, { passive: true });
    document.documentElement.addEventListener("mouseleave", handleMouseLeave);
    document.documentElement.addEventListener("mouseenter", handleMouseEnter);
    document.addEventListener("compositionstart", handleCompositionStart, true);
    document.addEventListener("compositionend", handleCompositionEnd, true);
    return () => {
      document.documentElement.removeEventListener("mousemove", handleMouseMove);
      document.documentElement.removeEventListener("mouseleave", handleMouseLeave);
      document.documentElement.removeEventListener("mouseenter", handleMouseEnter);
      document.removeEventListener("compositionstart", handleCompositionStart, true);
      document.removeEventListener("compositionend", handleCompositionEnd, true);
    };
  }, [effectiveEnabled, examSubmitted]);

  return { interrupted };
}
