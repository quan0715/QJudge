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
import { getExamCaptureSessionId } from "./examCaptureSession";
import {
  consumePrecheckScreenShareHandoff,
  consumeRuntimeScreenShareHandoff,
} from "./examScreenShareHandoff";

const FORCED_CAPTURE_COOLDOWN_MS = 1_000;

interface Options {
  contestId: string;
  enabled?: boolean;
  intervalMs?: number;
  maxRetries?: number;
  reportDegraded?: (isDegraded: boolean) => void;
  onUploadProgress?: (count: number) => void;
}

export const useAnticheatScreenCapture = ({
  contestId,
  enabled = false,
  intervalMs = 5000,
  maxRetries = 3,
  reportDegraded,
  onUploadProgress,
}: Options) => {
  const [uploadSessionId] = useState(() =>
    Math.random().toString(36).substring(2, 15)
  );
  const isCapturingRef = useRef(false);
  const isUploadingRef = useRef(false);
  const retryCountRef = useRef(0);
  const captureIntervalRef = useRef<ReturnType<typeof window.setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastForcedCaptureAtRef = useRef<number>(0);

  const { ensureQueue } = useFrameQueue();
  const { encodeUnderBudget } = useCanvasProcessor();
  const { uploadBatchWithRetry } = useAnticheatUploader(contestId);

  const stopStream = useCallback(() => {
    const stream = streamRef.current;
    streamRef.current = null;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
    }
  }, []);

  const acquireStream = useCallback(async (): Promise<MediaStream | null> => {
    if (streamRef.current?.active) return streamRef.current;
    stopStream();

    // Try to reuse the screen share stream from precheck or runtime reauth handoff.
    const handoff =
      consumePrecheckScreenShareHandoff() ??
      consumeRuntimeScreenShareHandoff();
    if (handoff?.active) {
      handoff.getVideoTracks()[0]?.addEventListener("ended", () => {
        if (streamRef.current === handoff) streamRef.current = null;
      });
      streamRef.current = handoff;
      return handoff;
    }

    // No handoff available — stream died or was never shared.
    // Do NOT call getDisplayMedia() again to avoid repeated browser prompts.
    // The capture loop will keep retrying and getting null, which is fine —
    // the server-side heartbeat timeout will eventually lock the student.
    return null;
  }, [stopStream]);

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
      if (!blob) return;
      const q = await ensureQueue();
      await q.enqueue(blob);
    } catch (err) {
      console.error("Capture failed:", err);
    } finally {
      isCapturingRef.current = false;
    }
  }, [enabled, captureFrameBlob, ensureQueue]);

  const flushPendingUploads = useCallback(async () => {
    if (isUploadingRef.current || !enabled) return;
    isUploadingRef.current = true;
    try {
      const q = await ensureQueue();
      const count = await q.count();
      if (count === 0) return;
      const items = await q.peek(10);
      const uploadedIds = await uploadBatchWithRetry(items, uploadSessionId, onUploadProgress);
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
  }, [enabled, ensureQueue, uploadBatchWithRetry, uploadSessionId, onUploadProgress, reportDegraded, maxRetries]);

  const forceStopCapture = useCallback(() => {
    if (captureIntervalRef.current) {
      clearInterval(captureIntervalRef.current);
      captureIntervalRef.current = null;
    }
    stopStream();
  }, [stopStream]);

  const forceCaptureNow = useCallback(async (
    _reason: string,
    _options?: ForcedCaptureOptions,
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

    const now = Date.now();
    if (now - lastForcedCaptureAtRef.current < FORCED_CAPTURE_COOLDOWN_MS) {
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
    lastForcedCaptureAtRef.current = now;

    const blob = await captureFrameBlob();
    if (!blob) {
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
      const uploadedIds = await uploadBatchWithRetry(
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
  }, [enabled, contestId, uploadSessionId, captureFrameBlob, ensureQueue, uploadBatchWithRetry, flushPendingUploads]);

  // Register forced capture handler for use by recordExamEventWithForcedCapture
  useEffect(() => {
    if (!contestId) return;
    registerForcedCaptureHandler(contestId, forceCaptureNow);
    return () => {
      unregisterForcedCaptureHandler(contestId, forceCaptureNow);
    };
  }, [contestId, forceCaptureNow]);

  // Interval-based capture + upload; stop stream when disabled
  useEffect(() => {
    if (!enabled) {
      if (captureIntervalRef.current) clearInterval(captureIntervalRef.current);
      stopStream();
      return;
    }

    captureIntervalRef.current = setInterval(() => {
      captureAndQueue();
      flushPendingUploads();
    }, intervalMs);

    return () => {
      if (captureIntervalRef.current) clearInterval(captureIntervalRef.current);
    };
  }, [enabled, intervalMs, captureAndQueue, flushPendingUploads, stopStream]);

  return {
    uploadSessionId,
    flushPendingUploads,
    forceStopCapture,
    forceCaptureNow,
  };
};

export default useAnticheatScreenCapture;
