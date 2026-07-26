import { useCallback, useEffect, useRef, useState } from "react";
import { createSfuScreenSharePublisher } from "./anticheat/sfuScreenSharePublisher";
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

interface Options {
  contestId: string;
  /** Controls use of the policy-enabled MediaRecorder source. */
  enabled?: boolean;
  /** Controls stream lifecycle monitoring. Stream stays alive and loss is detected
   *  as long as this is true, even if `enabled` is false (e.g. on dashboard). */
  monitorStream?: boolean;
  /** Keep screen-share alive across route unmount/remount within monitored flow. */
  preserveStreamOnUnmount?: boolean;
  expectInitialStream?: boolean;
  onScreenShareLost?: () => void;
}

export const useAnticheatScreenCapture = ({
  contestId,
  enabled = false,
  monitorStream = false,
  preserveStreamOnUnmount = false,
  expectInitialStream = false,
  onScreenShareLost,
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
  const [stream, setStream] = useState<MediaStream | null>(null);
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

  const updateStream = useCallback((nextStream: MediaStream | null) => {
    streamRef.current = nextStream;
    setStream(nextStream);
  }, []);

  const handleDetectedScreenShareLoss = useCallback(() => {
    streamWasLiveRef.current = false;
    lastSfuPublisherAttemptAtRef.current = 0;
    void sfuPublisherRef.current.stop(contestId);
    setStreamActive(false);
    onScreenShareLostRef.current?.();
  }, [contestId]);

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
    updateStream(null);
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
    }
    return !!stream;
  }, [updateStream]);

  const attachLiveStream = useCallback((stream: MediaStream): MediaStream => {
    stream.getVideoTracks()[0]?.addEventListener("ended", () => {
      if (streamRef.current === stream) {
        updateStream(null);
        handleDetectedScreenShareLoss();
      }
    });
    updateStream(stream);
    streamWasLiveRef.current = true;
    setStreamActive(true);
    hasCaptureSessionRef.current = true;
    ensureSfuPublisher(stream);
    return stream;
  }, [ensureSfuPublisher, handleDetectedScreenShareLoss, updateStream]);

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
      return attachLiveStream(handoff);
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
  }, [attachLiveStream, handleDetectedScreenShareLoss, stopStream]);

  const resumeFromRuntimeHandoff = useCallback(async (): Promise<boolean> => {
    const handoff = consumeRuntimeScreenShareHandoff();
    if (!handoff || !isStreamLive(handoff)) return false;
    stopStream();
    attachLiveStream(handoff);
    return true;
  }, [attachLiveStream, stopStream]);

  const forceStopCapture = useCallback(
    (reason: CaptureStopReason = "manual"): CaptureStopResult => {
      const hadPrecheckHandoff = !!peekPrecheckScreenShareHandoff();
      const hadRuntimeHandoff = !!peekRuntimeScreenShareHandoff();
      const hadStream = stopStream();
      const hadActiveSession = streamWasLiveRef.current || hasCaptureSessionRef.current;

      const status: CaptureStopResult["status"] =
        hadPrecheckHandoff || hadRuntimeHandoff || hadStream || hadActiveSession
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

      return result;
    },
    [contestId, stopStream],
  );

  useEffect(() => {
    registerCaptureStopHandler(contestId, forceStopCapture);
    return () => {
      unregisterCaptureStopHandler(contestId, forceStopCapture);
    };
  }, [contestId, forceStopCapture]);

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
          updateStream(null);
          setStreamActive(false);
          hasCaptureSessionRef.current = true;
          setRuntimeScreenShareHandoff(stream);
          clearPrecheckScreenShareHandoff(true);
          return;
        }
      }
      forceStopCapture("unmount");
    },
    [contestId, forceStopCapture, preserveStreamOnUnmount, updateStream],
  );

  // Lightweight stream health poll — detect loss even when capture interval is off.
  // The "ended" event is the primary detection, but this catches edge cases
  // (e.g. browser not firing "ended" reliably).
  useEffect(() => {
    if (!monitorStream) return;
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
    forceStopCapture,
    resumeFromRuntimeHandoff,
    stream,
    /** Reactive flag — true when screen share stream is alive. */
    streamActive,
  };
};

export default useAnticheatScreenCapture;
