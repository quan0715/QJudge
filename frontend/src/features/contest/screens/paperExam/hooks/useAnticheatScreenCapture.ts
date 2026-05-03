import { useCallback, useEffect, useRef, useState } from "react";
import { useCanvasProcessor } from "./anticheat/useCanvasProcessor";
import { useEventEvidenceCapture } from "./anticheat/useEventEvidenceCapture";
import { createSfuScreenSharePublisher } from "./anticheat/sfuScreenSharePublisher";
import {
  registerForcedCaptureHandler,
  unregisterForcedCaptureHandler,
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
import { getAnticheatPhase } from "@/features/contest/anticheat/orchestrator";
import { isStreamLive } from "@/features/contest/anticheat/mediaStreamHealth";

import type {
  CaptureStopReason,
  CaptureStopResult,
} from "@/features/contest/anticheat/captureLifecycle";
import {
  registerCaptureStopHandler,
  unregisterCaptureStopHandler,
} from "@/features/contest/anticheat/captureLifecycle";

interface CaptureLifecycleEvent {
  contestId: string;
  reason: CaptureStopReason;
  status: CaptureStopResult["status"];
  timestamp: string;
}

interface Options {
  contestId: string;
  /** Controls local evidence buffering. Persistent uploads happen only on forced capture. */
  enabled?: boolean;
  /** Controls stream lifecycle monitoring. Stream stays alive and loss is detected
   *  as long as this is true, even if `enabled` is false (e.g. on dashboard). */
  monitorStream?: boolean;
  /** Keep screen-share alive across route unmount/remount within monitored flow. */
  preserveStreamOnUnmount?: boolean;
  expectInitialStream?: boolean;
  intervalMs?: number;
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
    const newId = crypto.randomUUID().replace(/-/g, "").substring(0, 13);
    setExamCaptureSessionId(contestId, newId);
    return newId;
  });
  const streamRef = useRef<MediaStream | null>(null);
  const sfuPublisherRef = useRef(createSfuScreenSharePublisher());
  const lastSfuPublisherAttemptAtRef = useRef(0);
  const streamWasLiveRef = useRef(false);
  const prevMonitorStreamRef = useRef(monitorStream);
  const initialStreamExpectationCheckedRef = useRef(false);
  // Reactive stream status — ExamModeWrapper watches this for stream loss detection
  const [streamActive, setStreamActive] = useState(false);
  const hasCaptureSessionRef = useRef(false);
  const onScreenShareLostRef = useRef(onScreenShareLost);

  useEffect(() => {
    onScreenShareLostRef.current = onScreenShareLost;
  }, [onScreenShareLost]);

  const handleDetectedScreenShareLoss = useCallback(() => {
    streamWasLiveRef.current = false;
    lastSfuPublisherAttemptAtRef.current = 0;
    void sfuPublisherRef.current.stop(contestId);
    setStreamActive(false);
    onScreenShareLostRef.current?.();
  }, [contestId]);

  const { encodeUnderBudget } = useCanvasProcessor();

  const ensureSfuPublisher = useCallback(
    (stream: MediaStream) => {
      if (!monitorStream || sfuPublisherRef.current.state) return;
      const now = Date.now();
      if (now - lastSfuPublisherAttemptAtRef.current < 30_000) return;
      lastSfuPublisherAttemptAtRef.current = now;
      sfuPublisherRef.current.start(contestId, stream).catch(() => {
        // Live monitoring is best effort during Phase 1. Evidence capture must
        // continue even if Cloudflare Realtime is unavailable.
      });
    },
    [contestId, monitorStream],
  );

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
    const existingStream = streamRef.current;
    if (existingStream && isStreamLive(existingStream)) {
      hasCaptureSessionRef.current = true;
      ensureSfuPublisher(existingStream);
      return existingStream;
    }
    stopStream();

    // Try to reuse the screen share stream from precheck or runtime reauth handoff.
    const handoff =
      consumePrecheckScreenShareHandoff() ??
      consumeRuntimeScreenShareHandoff();
    if (handoff && isStreamLive(handoff)) {
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
      ensureSfuPublisher(handoff);
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
  }, [ensureSfuPublisher, handleDetectedScreenShareLoss, stopStream]);

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

  const isScreenShareUnavailable = useCallback(
    () => streamWasLiveRef.current && !isStreamLive(streamRef.current),
    [],
  );

  const markEvidenceBufferingStarted = useCallback(() => {
    hasCaptureSessionRef.current = true;
  }, []);

  const {
    flushPendingUploads,
    forceCaptureNow,
    stopEvidenceCapture,
  } = useEventEvidenceCapture({
    contestId,
    module: "screen_share",
    enabled,
    intervalMs,
    uploadSessionId,
    captureFrameBlob,
    isStreamUnavailable: isScreenShareUnavailable,
    onStreamUnavailable: handleDetectedScreenShareLoss,
    reportDegraded,
    onUploadProgress,
    onBufferingStarted: markEvidenceBufferingStarted,
    cooldown: {
      defaultMs: forcedCaptureCooldownMs,
      p1Ms: forcedCaptureP1CooldownMs,
    },
  });

  const forceStopCapture = useCallback(
    (reason: CaptureStopReason = "manual"): CaptureStopResult => {
      const hadEvidenceCapture = stopEvidenceCapture();
      const hadPrecheckHandoff = !!peekPrecheckScreenShareHandoff();
      const hadRuntimeHandoff = !!peekRuntimeScreenShareHandoff();
      const hadStream = stopStream();
      const hadActiveSession = streamWasLiveRef.current || hasCaptureSessionRef.current;

      const status: CaptureStopResult["status"] =
        hadEvidenceCapture || hadPrecheckHandoff || hadRuntimeHandoff || hadStream || hadActiveSession
          ? "stopped"
          : "already_stopped";
      const result: CaptureStopResult = {
        reason,
        status,
        timestamp: new Date().toISOString(),
      };

      void sfuPublisherRef.current.stop(contestId);
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
    [contestId, emitCaptureLifecycleEvent, stopEvidenceCapture, stopStream],
  );

  useEffect(() => {
    registerCaptureStopHandler(contestId, forceStopCapture);
    return () => {
      unregisterCaptureStopHandler(contestId, forceStopCapture);
    };
  }, [contestId, forceStopCapture]);

  // Register forced capture handler for use by recordExamEventWithForcedCapture
  useEffect(() => {
    if (!contestId) return;
    registerForcedCaptureHandler(contestId, "screen_share", forceCaptureNow);
    return () => {
      unregisterForcedCaptureHandler(contestId, "screen_share", forceCaptureNow);
    };
  }, [contestId, forceCaptureNow]);

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
      const phase = getAnticheatPhase(contestId);
      const shouldPreserveStream =
        preserveStreamOnUnmount &&
        phase !== "TERMINATING" &&
        phase !== "TERMINAL";
      if (shouldPreserveStream) {
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
    [contestId, forceStopCapture, preserveStreamOnUnmount],
  );

  // Lightweight stream health poll — detect loss even when capture interval is off.
  // The "ended" event is the primary detection, but this catches edge cases
  // (e.g. browser not firing "ended" reliably).
  useEffect(() => {
    if (!monitorStream || enabled) return; // skip if capture interval already handles this
    const healthCheck = setInterval(() => {
      const alive = isStreamLive(streamRef.current);
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
