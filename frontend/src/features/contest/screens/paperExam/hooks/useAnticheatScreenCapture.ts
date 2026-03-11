import { useCallback, useEffect, useRef, useState } from "react";
import { useFrameQueue } from "./anticheat/useFrameQueue";
import { useCanvasProcessor } from "./anticheat/useCanvasProcessor";
import { useAnticheatUploader } from "./anticheat/useAnticheatUploader";
import {
  registerForcedCaptureHandler,
  unregisterForcedCaptureHandler,
  type ForcedCaptureOptions,
  type ForcedCaptureResult,
} from "@/features/contest/anticheat/forcedCapture";
import {
  getExamCaptureSessionId,
  setExamCaptureSessionId,
} from "@/shared/state/examCaptureSessionStore";
import {
  consumePrecheckScreenShareHandoff,
  consumeRuntimeScreenShareHandoff,
  setRuntimeScreenShareHandoff,
  peekPrecheckScreenShareHandoff,
  peekRuntimeScreenShareHandoff,
  clearPrecheckScreenShareHandoff,
  clearRuntimeScreenShareHandoff,
} from "@/features/contest/anticheat/screenShareHandoffStore";

import { getEventPriority } from "@/features/contest/constants/eventTaxonomy";
import type {
  CaptureStopReason,
  CaptureStopResult,
} from "@/features/contest/anticheat/captureLifecycle";

interface CaptureLifecycleEvent {
  contestId: string;
  reason: CaptureStopReason;
  status: CaptureStopResult["status"];
  timestamp: string;
}

interface Options {
  contestId: string;
  /** Controls capture interval + upload. When false, no screenshots are taken. */
  enabled?: boolean;
  /** Controls stream lifecycle monitoring. Stream stays alive and loss is detected
   *  as long as this is true, even if `enabled` is false (e.g. on dashboard). */
  monitorStream?: boolean;
  /** Keep screen-share alive across route unmount/remount within monitored flow. */
  preserveStreamOnUnmount?: boolean;
  expectInitialStream?: boolean;
  intervalMs?: number;
  maxRetries?: number;
  forcedCaptureCooldownMs?: number;
  forcedCaptureP1CooldownMs?: number;
  reportDegraded?: (isDegraded: boolean) => void;
  onUploadProgress?: (count: number) => void;
  onScreenShareLost?: () => void;
  onCaptureLifecycleEvent?: (event: CaptureLifecycleEvent) => void;
}

export const useAnticheatScreenCapture = ({
  contestId,
  enabled = false,
  monitorStream = false,
  preserveStreamOnUnmount = false,
  expectInitialStream = false,
  intervalMs = 5000,
  maxRetries = 3,
  forcedCaptureCooldownMs = 1_000,
  forcedCaptureP1CooldownMs = 15_000,
  reportDegraded,
  onUploadProgress,
  onScreenShareLost,
  onCaptureLifecycleEvent,
}: Options) => {
  const [uploadSessionId] = useState(() => {
    // Reuse existing session ID if available (e.g. page reload during exam)
    const existing = getExamCaptureSessionId(contestId);
    if (existing) return existing;
    const newId = Math.random().toString(36).substring(2, 15);
    setExamCaptureSessionId(contestId, newId);
    return newId;
  });
  const isCapturingRef = useRef(false);
  const isUploadingRef = useRef(false);
  const retryCountRef = useRef(0);
  const captureIntervalRef = useRef<ReturnType<typeof window.setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const streamWasLiveRef = useRef(false);
  const prevMonitorStreamRef = useRef(monitorStream);
  const initialStreamExpectationCheckedRef = useRef(false);
  // Reactive stream status — ExamModeWrapper watches this for stream loss detection
  const [streamActive, setStreamActive] = useState(false);
  const hasCaptureSessionRef = useRef(false);
  const lastForcedCaptureByTypeRef = useRef<Map<string, number>>(new Map());
  const onScreenShareLostRef = useRef(onScreenShareLost);
  onScreenShareLostRef.current = onScreenShareLost;

  const handleDetectedScreenShareLoss = useCallback(() => {
    streamWasLiveRef.current = false;
    setStreamActive(false);
    onScreenShareLostRef.current?.();
  }, []);

  const { ensureQueue } = useFrameQueue();
  const { encodeUnderBudget } = useCanvasProcessor();
  const { uploadBatch } = useAnticheatUploader(contestId);

  const stopStream = useCallback(() => {
    const stream = streamRef.current;
    streamRef.current = null;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
    }
    return !!stream;
  }, []);

  const emitCaptureLifecycleEvent = useCallback(
    (event: CaptureLifecycleEvent) => {
      if (onCaptureLifecycleEvent) {
        onCaptureLifecycleEvent(event);
        return;
      }
      console.info("[anticheat][capture] lifecycle", event);
    },
    [onCaptureLifecycleEvent],
  );

  const acquireStream = useCallback(async (): Promise<MediaStream | null> => {
    if (streamRef.current?.active) {
      hasCaptureSessionRef.current = true;
      return streamRef.current;
    }
    stopStream();

    // Try to reuse the screen share stream from precheck or runtime reauth handoff.
    const handoff =
      consumePrecheckScreenShareHandoff() ??
      consumeRuntimeScreenShareHandoff();
    if (handoff?.active) {
      handoff.getVideoTracks()[0]?.addEventListener("ended", () => {
        if (streamRef.current === handoff) {
          streamRef.current = null;
          handleDetectedScreenShareLoss();
        }
      });
      streamRef.current = handoff;
      streamWasLiveRef.current = true;
      setStreamActive(true);
      hasCaptureSessionRef.current = true;
      return handoff;
    }

    // A stale handoff stream means sharing was interrupted before first capture.
    // Surface it as loss so runtime re-share flow can start immediately.
    if (handoff) {
      hasCaptureSessionRef.current = true;
      handleDetectedScreenShareLoss();
    }

    // No handoff available — stream died or was never shared.
    // Do NOT call getDisplayMedia() again to avoid repeated browser prompts.
    return null;
  }, [handleDetectedScreenShareLoss, stopStream]);

  const captureFrameBlob = useCallback(async (): Promise<Blob | null> => {
    const stream = await acquireStream();
    if (!stream) return null;
    try {
      const track = stream.getVideoTracks()[0];
      if (!track) return null;
      const imageCapture = new (window as any).ImageCapture(track);
      const bitmap = await imageCapture.grabFrame();
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { bitmap.close(); return null; }
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      return await encodeUnderBudget(canvas);
    } catch {
      return null;
    }
  }, [acquireStream, encodeUnderBudget]);

  const captureAndQueue = useCallback(async () => {
    if (isCapturingRef.current || !enabled) return;
    isCapturingRef.current = true;
    try {
      const blob = await captureFrameBlob();
      if (!blob) {
        // Fallback: detect stream loss if the ended event didn't fire.
        // If stream was previously live but now acquireStream returns null,
        // the user has stopped sharing.
        if (streamWasLiveRef.current && !streamRef.current?.active) {
          handleDetectedScreenShareLoss();
        }
        return;
      }
      const q = await ensureQueue();
      await q.enqueue(blob);
    } catch (err) {
      console.error("Capture failed:", err);
    } finally {
      isCapturingRef.current = false;
    }
  }, [enabled, captureFrameBlob, ensureQueue, handleDetectedScreenShareLoss]);

  const flushPendingUploads = useCallback(async () => {
    if (isUploadingRef.current || !enabled) return;
    isUploadingRef.current = true;
    try {
      const q = await ensureQueue();
      const count = await q.count();
      if (count === 0) return;
      const items = await q.peek(10);
      const uploadedIds = await uploadBatch(items, uploadSessionId, onUploadProgress);
      await q.remove(uploadedIds);
      retryCountRef.current = 0;
      reportDegraded?.(false);
    } catch {
      retryCountRef.current += 1;
      if (retryCountRef.current >= maxRetries) {
        reportDegraded?.(true);
      }
    } finally {
      isUploadingRef.current = false;
    }
  }, [enabled, ensureQueue, uploadBatch, uploadSessionId, onUploadProgress, reportDegraded, maxRetries]);

  const forceStopCapture = useCallback(
    (reason: CaptureStopReason = "manual"): CaptureStopResult => {
      const hadInterval = captureIntervalRef.current != null;
      const hadPrecheckHandoff = !!peekPrecheckScreenShareHandoff();
      const hadRuntimeHandoff = !!peekRuntimeScreenShareHandoff();
      const hadStream = stopStream();
      const hadActiveSession = streamWasLiveRef.current || hasCaptureSessionRef.current;

      const status: CaptureStopResult["status"] =
        hadInterval || hadPrecheckHandoff || hadRuntimeHandoff || hadStream || hadActiveSession
          ? "stopped"
          : "already_stopped";
      const result: CaptureStopResult = {
        reason,
        status,
        timestamp: new Date().toISOString(),
      };

      if (captureIntervalRef.current) {
        clearInterval(captureIntervalRef.current);
        captureIntervalRef.current = null;
      }
      streamWasLiveRef.current = false;
      hasCaptureSessionRef.current = false;
      setStreamActive(false);
      // Also stop any streams waiting in handoff slots.
      clearPrecheckScreenShareHandoff(true);
      clearRuntimeScreenShareHandoff(true);

      emitCaptureLifecycleEvent({
        contestId,
        reason,
        status: result.status,
        timestamp: result.timestamp,
      });
      return result;
    },
    [contestId, emitCaptureLifecycleEvent, stopStream],
  );

  const forceCaptureNow = useCallback(async (
    _reason: string,
    _options?: ForcedCaptureOptions & { eventType?: string },
  ): Promise<ForcedCaptureResult> => {
    const currentUploadSessionId =
      uploadSessionId || (contestId ? getExamCaptureSessionId(contestId) : null);

    if (!enabled) {
      return {
        attempted: false,
        captured: false,
        uploaded: false,
        skipped: "disabled",
        errorCode: "capture_disabled",
        uploadSessionId: currentUploadSessionId,
        seq: null,
      };
    }

    const eventType = _options?.eventType;
    const priority = eventType ? getEventPriority(eventType) : 1;
    const now = Date.now();

    // P0: no cooldown — always capture
    // P1: 15s per-type cooldown
    // P2/P3: should not reach here (handled by recordViolation.usecase)
    if (priority > 0) {
      const cooldownMs = priority === 1 ? forcedCaptureP1CooldownMs : forcedCaptureCooldownMs;
      const cooldownKey = eventType || "_default";
      const lastCapture = lastForcedCaptureByTypeRef.current.get(cooldownKey) || 0;
      if (now - lastCapture < cooldownMs) {
        return {
          attempted: false,
          captured: false,
          uploaded: false,
          skipped: "cooldown",
          errorCode: "capture_cooldown",
          uploadSessionId: currentUploadSessionId,
          seq: null,
        };
      }
      lastForcedCaptureByTypeRef.current.set(cooldownKey, now);
    }

    const blob = await captureFrameBlob();
    if (!blob) {
      // Fallback: detect stream loss if the ended event didn't fire
      if (streamWasLiveRef.current && !streamRef.current?.active) {
        handleDetectedScreenShareLoss();
      }
      return {
        attempted: true,
        captured: false,
        uploaded: false,
        skipped: "stream_unavailable",
        errorCode: "stream_unavailable",
        uploadSessionId: currentUploadSessionId,
        seq: null,
      };
    }

    const q = await ensureQueue();
    const frameId = await q.enqueue(blob);

    try {
      const uploadedIds = await uploadBatch(
        [{ id: frameId, createdAt: Date.now(), blob }],
        uploadSessionId,
      );
      if (uploadedIds.length > 0) {
        await q.remove(uploadedIds);
        return {
          attempted: true,
          captured: true,
          uploaded: true,
          uploadSessionId: currentUploadSessionId,
          seq: frameId,
        };
      }
    } catch {
      void flushPendingUploads();
    }

    return {
      attempted: true,
      captured: true,
      uploaded: false,
      uploadSessionId: currentUploadSessionId,
      seq: frameId,
    };
  }, [
    enabled,
    contestId,
    uploadSessionId,
    captureFrameBlob,
    ensureQueue,
    uploadBatch,
    flushPendingUploads,
    forcedCaptureCooldownMs,
    forcedCaptureP1CooldownMs,
    handleDetectedScreenShareLoss,
  ]);

  // Register forced capture handler for use by recordExamEventWithForcedCapture
  useEffect(() => {
    if (!contestId) return;
    registerForcedCaptureHandler(contestId, forceCaptureNow);
    return () => {
      unregisterForcedCaptureHandler(contestId, forceCaptureNow);
    };
  }, [contestId, forceCaptureNow]);

  // Interval-based capture + upload (only when enabled)
  useEffect(() => {
    if (!enabled) {
      if (captureIntervalRef.current) clearInterval(captureIntervalRef.current);
      captureIntervalRef.current = null;
      return;
    }
    hasCaptureSessionRef.current = true;

    captureIntervalRef.current = setInterval(() => {
      captureAndQueue();
      flushPendingUploads();
    }, intervalMs);

    return () => {
      if (captureIntervalRef.current) clearInterval(captureIntervalRef.current);
    };
  }, [enabled, intervalMs, captureAndQueue, flushPendingUploads]);

  // Stream lifecycle — stop only on true -> false transition.
  // This avoids killing precheck handoff stream during initial mount while
  // policy/config state is still hydrating.
  useEffect(() => {
    const wasMonitoring = prevMonitorStreamRef.current;
    if (wasMonitoring && !monitorStream && !preserveStreamOnUnmount) {
      forceStopCapture("monitor_disabled");
    }
    prevMonitorStreamRef.current = monitorStream;
  }, [forceStopCapture, monitorStream, preserveStreamOnUnmount]);

  // Last-resort cleanup for route transitions/unmount.
  useEffect(
    () => () => {
      if (captureIntervalRef.current) {
        clearInterval(captureIntervalRef.current);
        captureIntervalRef.current = null;
      }
      if (preserveStreamOnUnmount) {
        const stream = streamRef.current;
        if (stream?.active) {
          streamRef.current = null;
          setStreamActive(false);
          hasCaptureSessionRef.current = true;
          setRuntimeScreenShareHandoff(stream);
          clearPrecheckScreenShareHandoff(true);
          return;
        }
      }
      forceStopCapture("unmount");
    },
    [forceStopCapture, preserveStreamOnUnmount],
  );

  // Lightweight stream health poll — detect loss even when capture interval is off.
  // The "ended" event is the primary detection, but this catches edge cases
  // (e.g. browser not firing "ended" reliably).
  useEffect(() => {
    if (!monitorStream || enabled) return; // skip if capture interval already handles this
    const healthCheck = setInterval(() => {
      const alive = streamRef.current?.active ?? false;
      const wasLive = streamWasLiveRef.current;
      if (wasLive && !alive) {
        handleDetectedScreenShareLoss();
      }
    }, 2000);
    return () => clearInterval(healthCheck);
  }, [monitorStream, enabled, handleDetectedScreenShareLoss]);

  // Bootstrap stream attachment as soon as monitoring starts.
  // When expectInitialStream=true (precheck handoff path), a missing stream
  // should immediately enter re-share recovery flow instead of silently waiting.
  useEffect(() => {
    if (!monitorStream) {
      initialStreamExpectationCheckedRef.current = false;
      return;
    }
    if (initialStreamExpectationCheckedRef.current) return;
    initialStreamExpectationCheckedRef.current = true;

    let active = true;
    void (async () => {
      const stream = await acquireStream();
      if (!active) return;
      if (!stream && expectInitialStream && !streamWasLiveRef.current) {
        hasCaptureSessionRef.current = true;
        handleDetectedScreenShareLoss();
      }
    })();

    return () => {
      active = false;
    };
  }, [acquireStream, expectInitialStream, handleDetectedScreenShareLoss, monitorStream]);

  return {
    uploadSessionId,
    flushPendingUploads,
    forceStopCapture,
    forceCaptureNow,
    /** Reactive flag — true when screen share stream is alive. */
    streamActive,
  };
};

export default useAnticheatScreenCapture;
