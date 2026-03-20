import { useCallback, useEffect, useRef, useState } from "react";
import { useFrameQueue } from "./anticheat/useFrameQueue";
import { useCanvasProcessor } from "./anticheat/useCanvasProcessor";
import { useAnticheatUploader } from "./anticheat/useAnticheatUploader";
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
  requestUserMediaVideo,
  supportsUserMediaApi,
} from "@/features/contest/anticheat/mediaApi";
import type { ForcedCaptureResult } from "@/features/contest/anticheat/forcedCapture";
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
  intervalMs?: number;
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
  intervalMs = 10_000,
  maxRetries = 3,
  reportDegraded,
  onUploadProgress,
  onWebcamLost,
}: Options) => {
  const [uploadSessionId] = useState(() => {
    const existing = getExamCaptureSessionId(contestId);
    if (existing) return existing;
    const created = Math.random().toString(36).substring(2, 15);
    setExamCaptureSessionId(contestId, created);
    return created;
  });
  const streamRef = useRef<MediaStream | null>(null);
  const streamWasLiveRef = useRef(false);
  const initialExpectationCheckedRef = useRef(false);
  const prevMonitorRef = useRef(monitorStream);
  const captureTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isCapturingRef = useRef(false);
  const isUploadingRef = useRef(false);
  const retryCountRef = useRef(0);
  const initialCaptureAttemptedRef = useRef(false);
  const [streamActive, setStreamActive] = useState(false);
  const onWebcamLostRef = useRef(onWebcamLost);
  onWebcamLostRef.current = onWebcamLost;

  const { ensureQueue } = useFrameQueue("webcam");
  const { encodeUnderBudget } = useCanvasProcessor();
  const { uploadBatch } = useAnticheatUploader(contestId, "webcam");

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
    setStreamActive(false);
    onWebcamLostRef.current?.();
  }, []);

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
      return stream;
    }
    stream.getTracks().forEach((t) => t.stop());
    return null;
  }, [handleDetectedWebcamLoss]);

  const acquireStream = useCallback(async (): Promise<MediaStream | null> => {
    if (isStreamHealthy(streamRef.current)) return streamRef.current;
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
  }, [autoAcquireOnStart, acceptOrRejectStream, stopStream]);

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

  const captureAndQueue = useCallback(async () => {
    if (isCapturingRef.current || !enabled) return;
    isCapturingRef.current = true;
    try {
      const blob = await captureFrameBlob();
      if (!blob) {
        if (streamWasLiveRef.current && !isStreamHealthy(streamRef.current)) {
          handleDetectedWebcamLoss();
        }
        return;
      }
      const q = await ensureQueue();
      await q.enqueue(blob);
    } finally {
      isCapturingRef.current = false;
    }
  }, [captureFrameBlob, enabled, ensureQueue, handleDetectedWebcamLoss]);

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
  }, [enabled, ensureQueue, maxRetries, onUploadProgress, reportDegraded, uploadBatch, uploadSessionId]);

  const forceCaptureNow = useCallback(
    async (_reason: string): Promise<ForcedCaptureResult> => {
      const currentUploadSessionId = uploadSessionId || (contestId ? getExamCaptureSessionId(contestId) : null);
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

      const blob = await captureFrameBlob();
      if (!blob) {
        if (streamWasLiveRef.current && !isStreamHealthy(streamRef.current)) {
          handleDetectedWebcamLoss();
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
          onUploadProgress,
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
    },
    [
      captureFrameBlob,
      contestId,
      enabled,
      ensureQueue,
      flushPendingUploads,
      handleDetectedWebcamLoss,
      onUploadProgress,
      uploadBatch,
      uploadSessionId,
    ],
  );

  const forceStopCapture = useCallback(() => {
    if (captureTimerRef.current) {
      clearInterval(captureTimerRef.current);
      captureTimerRef.current = null;
    }
    stopStream();
    streamWasLiveRef.current = false;
    setStreamActive(false);
    clearPrecheckWebcamHandoff(true);
    clearRuntimeWebcamHandoff(true);
  }, [stopStream]);

  useEffect(() => {
    if (!enabled) {
      if (captureTimerRef.current) {
        clearInterval(captureTimerRef.current);
        captureTimerRef.current = null;
      }
      initialCaptureAttemptedRef.current = false;
      return;
    }
    captureTimerRef.current = setInterval(() => {
      captureAndQueue();
      void flushPendingUploads();
    }, intervalMs);
    return () => {
      if (captureTimerRef.current) {
        clearInterval(captureTimerRef.current);
        captureTimerRef.current = null;
      }
    };
  }, [captureAndQueue, enabled, flushPendingUploads, intervalMs]);

  // Best effort: capture one frame immediately when source becomes enabled.
  useEffect(() => {
    if (!enabled) {
      initialCaptureAttemptedRef.current = false;
      return;
    }
    if (initialCaptureAttemptedRef.current) return;
    initialCaptureAttemptedRef.current = true;
    void (async () => {
      await captureAndQueue();
      await flushPendingUploads();
    })();
  }, [enabled, captureAndQueue, flushPendingUploads]);

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
      if (captureTimerRef.current) {
        clearInterval(captureTimerRef.current);
        captureTimerRef.current = null;
      }
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
