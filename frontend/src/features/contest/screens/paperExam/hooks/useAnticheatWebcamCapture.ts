import { useCallback, useEffect, useRef, useState } from "react";
import { useCanvasProcessor } from "./anticheat/useCanvasProcessor";
import { useEventEvidenceCapture } from "./anticheat/useEventEvidenceCapture";
import { createSfuVideoPublisher } from "./anticheat/sfuScreenSharePublisher";
import {
  getExamCaptureSessionId,
  setExamCaptureSessionId,
} from "@/shared/state/examCaptureSessionStore";
import { getAnticheatPhase } from "@/features/contest/anticheat/orchestrator";
import {
  clearPrecheckWebcamHandoff,
  clearRuntimeWebcamHandoff,
  consumePrecheckWebcamHandoff,
  consumeRuntimeWebcamHandoff,
  setRuntimeWebcamHandoff,
} from "@/features/contest/anticheat/webcamHandoffStore";
import {
  registerForcedCaptureHandler,
  unregisterForcedCaptureHandler,
} from "@/features/contest/anticheat/forcedCapture";
import {
  requestUserMediaVideo,
  supportsUserMediaApi,
} from "@/features/contest/anticheat/mediaApi";
import {
  getPrimaryVideoTrack,
  isStreamHealthy,
} from "@/features/contest/anticheat/mediaStreamHealth";

interface Options {
  contestId: string;
  enabled?: boolean;
  monitorStream?: boolean;
  preserveStreamOnUnmount?: boolean;
  expectInitialStream?: boolean;
  autoAcquireOnStart?: boolean;
  publishLiveStream?: boolean;
  intervalMs?: number;
  /** Deprecated: event-keyed evidence no longer retries background frame uploads. */
  maxRetries?: number;
  reportDegraded?: (isDegraded: boolean) => void;
  onUploadProgress?: (count: number) => void;
  onWebcamLost?: () => void;
}

export const useAnticheatWebcamCapture = ({
  contestId,
  enabled = false,
  monitorStream = false,
  preserveStreamOnUnmount = false,
  expectInitialStream = false,
  autoAcquireOnStart = false,
  publishLiveStream = false,
  intervalMs = 10_000,
  reportDegraded,
  onUploadProgress,
  onWebcamLost,
}: Options) => {
  const [uploadSessionId] = useState(() => {
    const existing = getExamCaptureSessionId(contestId);
    if (existing) return existing;
    const created = crypto.randomUUID().replace(/-/g, "").substring(0, 13);
    setExamCaptureSessionId(contestId, created);
    return created;
  });
  const streamRef = useRef<MediaStream | null>(null);
  const sfuPublisherRef = useRef(createSfuVideoPublisher("webcam"));
  const lastSfuPublisherAttemptAtRef = useRef(0);
  const streamWasLiveRef = useRef(false);
  const initialExpectationCheckedRef = useRef(false);
  const prevMonitorRef = useRef(monitorStream);
  const [streamActive, setStreamActive] = useState(false);
  const onWebcamLostRef = useRef(onWebcamLost);
  onWebcamLostRef.current = onWebcamLost;

  const { encodeUnderBudget } = useCanvasProcessor();

  const ensureSfuPublisher = useCallback(
    (stream: MediaStream) => {
      if (!publishLiveStream || !monitorStream || sfuPublisherRef.current.state) return;
      const now = Date.now();
      if (now - lastSfuPublisherAttemptAtRef.current < 30_000) return;
      lastSfuPublisherAttemptAtRef.current = now;
      sfuPublisherRef.current.start(contestId, stream).catch(() => {
        // Live monitoring is best effort; evidence capture must continue.
      });
    },
    [contestId, monitorStream, publishLiveStream],
  );

  const stopStream = useCallback(() => {
    const stream = streamRef.current;
    streamRef.current = null;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    return !!stream;
  }, []);

  const handleDetectedWebcamLoss = useCallback(() => {
    streamWasLiveRef.current = false;
    lastSfuPublisherAttemptAtRef.current = 0;
    void sfuPublisherRef.current.stop(contestId);
    setStreamActive(false);
    onWebcamLostRef.current?.();
  }, [contestId]);

  const acceptOrRejectStream = useCallback((stream: MediaStream): MediaStream | null => {
    const track = getPrimaryVideoTrack(stream);
    track?.addEventListener("ended", () => {
      if (streamRef.current === stream) {
        streamRef.current = null;
        handleDetectedWebcamLoss();
      }
    });
    if (isStreamHealthy(stream)) {
      streamRef.current = stream;
      streamWasLiveRef.current = true;
      setStreamActive(true);
      ensureSfuPublisher(stream);
      return stream;
    }
    stream.getTracks().forEach((t) => t.stop());
    return null;
  }, [ensureSfuPublisher, handleDetectedWebcamLoss]);

  const acquireStream = useCallback(async (): Promise<MediaStream | null> => {
    const currentStream = streamRef.current;
    if (currentStream && isStreamHealthy(currentStream)) {
      ensureSfuPublisher(currentStream);
      return currentStream;
    }
    stopStream();

    const handoff = consumePrecheckWebcamHandoff() ?? consumeRuntimeWebcamHandoff();
    if (handoff?.active) {
      return acceptOrRejectStream(handoff);
    }

    if (!autoAcquireOnStart) return null;
    if (!supportsUserMediaApi()) return null;
    try {
      const stream = await requestUserMediaVideo();
      return acceptOrRejectStream(stream);
    } catch {
      return null;
    }
  }, [autoAcquireOnStart, acceptOrRejectStream, ensureSfuPublisher, stopStream]);

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
      if (!ctx) {
        bitmap.close();
        return null;
      }
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      return await encodeUnderBudget(canvas);
    } catch {
      return null;
    }
  }, [acquireStream, encodeUnderBudget]);

  const isWebcamUnavailable = useCallback(
    () => streamWasLiveRef.current && !isStreamHealthy(streamRef.current),
    [],
  );

  const {
    flushPendingUploads,
    forceCaptureNow,
    stopEvidenceCapture,
  } = useEventEvidenceCapture({
    contestId,
    module: "webcam",
    enabled,
    intervalMs,
    uploadSessionId,
    captureFrameBlob,
    isStreamUnavailable: isWebcamUnavailable,
    onStreamUnavailable: handleDetectedWebcamLoss,
    reportDegraded,
    onUploadProgress,
  });

  const forceStopCapture = useCallback(() => {
    stopEvidenceCapture();
    void sfuPublisherRef.current.stop(contestId);
    lastSfuPublisherAttemptAtRef.current = 0;
    stopStream();
    streamWasLiveRef.current = false;
    setStreamActive(false);
    clearPrecheckWebcamHandoff(true);
    clearRuntimeWebcamHandoff(true);
  }, [contestId, stopEvidenceCapture, stopStream]);

  useEffect(() => {
    if (!contestId) return;
    registerForcedCaptureHandler(contestId, "webcam", forceCaptureNow);
    return () => {
      unregisterForcedCaptureHandler(contestId, "webcam", forceCaptureNow);
    };
  }, [contestId, forceCaptureNow]);

  useEffect(() => {
    const wasMonitoring = prevMonitorRef.current;
    if (wasMonitoring && !monitorStream && !preserveStreamOnUnmount) {
      forceStopCapture();
    }
    prevMonitorRef.current = monitorStream;
  }, [forceStopCapture, monitorStream, preserveStreamOnUnmount]);

  useEffect(() => {
    if (!monitorStream || enabled) return;
    const timer = setInterval(() => {
      const alive = isStreamHealthy(streamRef.current);
      if (streamWasLiveRef.current && !alive) {
        handleDetectedWebcamLoss();
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [enabled, handleDetectedWebcamLoss, monitorStream]);

  useEffect(() => {
    if (!monitorStream) {
      initialExpectationCheckedRef.current = false;
      return;
    }
    if (initialExpectationCheckedRef.current) return;
    initialExpectationCheckedRef.current = true;
    let alive = true;
    void (async () => {
      const stream = await acquireStream();
      if (!alive) return;
      if (!stream && expectInitialStream && !streamWasLiveRef.current) {
        handleDetectedWebcamLoss();
      }
    })();
    return () => {
      alive = false;
    };
  }, [acquireStream, expectInitialStream, handleDetectedWebcamLoss, monitorStream]);

  useEffect(
    () => () => {
      const phase = getAnticheatPhase(contestId);
      const shouldPreserveStream =
        preserveStreamOnUnmount && phase !== "TERMINATING" && phase !== "TERMINAL";
      if (shouldPreserveStream) {
        const stream = streamRef.current;
        if (stream?.active) {
          streamRef.current = null;
          setStreamActive(false);
          setRuntimeWebcamHandoff(stream);
          clearPrecheckWebcamHandoff(true);
          return;
        }
      }
      forceStopCapture();
    },
    [contestId, forceStopCapture, preserveStreamOnUnmount]
  );

  return {
    uploadSessionId,
    streamActive,
    flushPendingUploads,
    forceStopCapture,
    forceCaptureNow,
  };
};

export default useAnticheatWebcamCapture;
