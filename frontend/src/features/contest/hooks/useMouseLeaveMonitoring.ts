import { useEffect, useRef, useState } from "react";
import type { IntegrityJsonValue } from "@/core/entities/examIntegrity.entity";
import type { IntegritySignalEmitter } from "@/features/contest/anticheat/integrity/IntegrityRuntimeContext";

const IME_COMPOSITION_GUARD_MS = 900;
const POINTER_IDLE_THRESHOLD_MS = 2_000;
const POINTER_BOUNDARY_DEBOUNCE_MS = 300;

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
  const interruptedRef = useRef(false);
  const pendingLeaveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    emitterRef.current = emitter;
  }, [emitter]);

  const effectiveEnabled = enabled && (!isTablet || supportsFinePointer);
  useEffect(() => {
    if (!effectiveEnabled || examSubmitted) {
      interruptedRef.current = false;
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
      if (interruptedRef.current || pendingLeaveTimerRef.current !== null) return;
      const now = Date.now();
      if (now - lastMouseMoveAtRef.current > POINTER_IDLE_THRESHOLD_MS) return;
      if (isComposingRef.current || now - lastCompositionEndAtRef.current < IME_COMPOSITION_GUARD_MS) return;
      pendingLeaveTimerRef.current = window.setTimeout(() => {
        pendingLeaveTimerRef.current = null;
        if (interruptedRef.current) return;
        interruptedRef.current = true;
        setInterrupted(true);
        emit("mouse_leave_triggered", {
          reason: "mouse_left_exam_window",
        });
      }, POINTER_BOUNDARY_DEBOUNCE_MS);
    };
    const handleMouseEnter = () => {
      lastMouseMoveAtRef.current = Date.now();
      if (pendingLeaveTimerRef.current !== null) {
        window.clearTimeout(pendingLeaveTimerRef.current);
        pendingLeaveTimerRef.current = null;
        return;
      }
      if (!interruptedRef.current) return;
      interruptedRef.current = false;
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
      if (pendingLeaveTimerRef.current !== null) {
        window.clearTimeout(pendingLeaveTimerRef.current);
        pendingLeaveTimerRef.current = null;
      }
      interruptedRef.current = false;
      document.documentElement.removeEventListener("mousemove", handleMouseMove);
      document.documentElement.removeEventListener("mouseleave", handleMouseLeave);
      document.documentElement.removeEventListener("mouseenter", handleMouseEnter);
      document.removeEventListener("compositionstart", handleCompositionStart, true);
      document.removeEventListener("compositionend", handleCompositionEnd, true);
    };
  }, [effectiveEnabled, examSubmitted]);

  return { interrupted };
}
