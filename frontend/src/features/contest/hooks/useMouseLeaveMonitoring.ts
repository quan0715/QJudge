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
import type { ForcedCaptureModule } from "@/features/contest/anticheat/forcedCapture";

const IME_COMPOSITION_GUARD_MS = 900;

/**
 * iPadOS hides the pointer after ~2-3 seconds of inactivity, firing a
 * mouseleave with relatedTarget=null. We track the last mousemove timestamp
 * and suppress any mouseleave that arrives after the pointer has been idle
 * longer than this threshold — it's an auto-hide, not a real window exit.
 */
const POINTER_IDLE_THRESHOLD_MS = 2_000;
const MOUSE_LEAVE_EVIDENCE_WINDOW_SECONDS = 3;

export interface UseMouseLeaveMonitoringConfig {
  contestId: string;
  enabled: boolean;
  isTablet?: boolean;
  supportsFinePointer?: boolean;
  examSubmitted: boolean;
  recoveryGraceMs?: number;
  cooldownMs?: number;
  evidenceCaptureModules?: ForcedCaptureModule[];
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
  supportsFinePointer = false,
  examSubmitted,
  recoveryGraceMs,
  cooldownMs = 3000,
  evidenceCaptureModules,
  onViolation,
  requestForceSubmit,
}: UseMouseLeaveMonitoringConfig): UseMouseLeaveMonitoringReturn {
  const effectiveEnabled = enabled && (!isTablet || supportsFinePointer);
  const pipeline = useViolationPipeline({
    route: mouseLeaveRoute,
    contestId,
    enabled: effectiveEnabled,
    examSubmitted,
    recoveryGraceMs,
    moduleRole: "primary",
    requestForceSubmit,
    onViolation,
    forceSubmitExtras: {
      sourceModule: "screen_share",
      evidenceCaptureModules,
    },
  });

  const isComposingRef = useRef(false);
  const lastCompositionEndAtRef = useRef(0);
  const lastTriggerAtRef = useRef(0);
  const lastMouseMoveAtRef = useRef(0);

  useEffect(() => {
    if (!effectiveEnabled || examSubmitted) return;
    lastMouseMoveAtRef.current = Date.now();

    // Track pointer movement to distinguish real exits from iPadOS idle hide.
    const handleMouseMove = () => {
      lastMouseMoveAtRef.current = Date.now();
    };

    const handleMouseLeave = (e: MouseEvent) => {
      if (e.relatedTarget !== null) return;

      // iPadOS auto-hides the cursor after ~2-3s of inactivity and fires a
      // synthetic mouseleave. If the pointer has been idle longer than the
      // threshold, this is almost certainly an auto-hide — not a real exit.
      const idleMs = Date.now() - lastMouseMoveAtRef.current;
      if (idleMs > POINTER_IDLE_THRESHOLD_MS) return;

      if (isComposingRef.current) return;
      if (
        Date.now() - lastCompositionEndAtRef.current <
        IME_COMPOSITION_GUARD_MS
      )
        return;
      if (pipeline.isInterrupted) return;

      const now = Date.now();
      if (now - lastTriggerAtRef.current < cooldownMs) return;
      lastTriggerAtRef.current = now;

      const observedAt = new Date(now).toISOString();
      pipeline.trigger({
        reason: "mouse_left_exam_window",
        observed_at: observedAt,
        evidence_anchor_at: observedAt,
        evidence_window_before_seconds: MOUSE_LEAVE_EVIDENCE_WINDOW_SECONDS,
        evidence_window_after_seconds: MOUSE_LEAVE_EVIDENCE_WINDOW_SECONDS,
      });
    };

    const handleMouseEnter = () => {
      lastMouseMoveAtRef.current = Date.now();
      pipeline.recover("mouse_returned");
    };

    const handleCompositionStart = () => {
      isComposingRef.current = true;
    };

    const handleCompositionEnd = () => {
      isComposingRef.current = false;
      lastCompositionEndAtRef.current = Date.now();
    };

    document.documentElement.addEventListener("mousemove", handleMouseMove, {
      passive: true,
    });
    document.documentElement.addEventListener("mouseleave", handleMouseLeave);
    document.documentElement.addEventListener("mouseenter", handleMouseEnter);
    document.addEventListener("compositionstart", handleCompositionStart, true);
    document.addEventListener("compositionend", handleCompositionEnd, true);

    return () => {
      document.documentElement.removeEventListener(
        "mousemove",
        handleMouseMove,
      );
      document.documentElement.removeEventListener(
        "mouseleave",
        handleMouseLeave,
      );
      document.documentElement.removeEventListener(
        "mouseenter",
        handleMouseEnter,
      );
      document.removeEventListener(
        "compositionstart",
        handleCompositionStart,
        true,
      );
      document.removeEventListener(
        "compositionend",
        handleCompositionEnd,
        true,
      );
    };
  }, [effectiveEnabled, examSubmitted, pipeline, cooldownMs]);

  return { recoveryCountdown: pipeline.recoveryCountdown };
}
