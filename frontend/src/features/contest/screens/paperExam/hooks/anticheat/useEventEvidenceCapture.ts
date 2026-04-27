import { useCallback, useEffect, useRef } from "react";
import { getEventPriority } from "@/features/contest/constants/eventTaxonomy";
import {
  getExamCaptureSessionId,
} from "@/shared/state/examCaptureSessionStore";
import type {
  ForcedCaptureModule,
  ForcedCaptureOptions,
  ForcedCaptureResult,
} from "@/features/contest/anticheat/forcedCapture";
import { createEvidenceRingBuffer } from "./evidenceRingBuffer";
import { useAnticheatUploader } from "./useAnticheatUploader";

interface Options {
  contestId: string;
  module: ForcedCaptureModule;
  enabled: boolean;
  intervalMs: number;
  uploadSessionId: string;
  captureFrameBlob: () => Promise<Blob | null>;
  isStreamUnavailable: () => boolean;
  onStreamUnavailable: () => void;
  reportDegraded?: (isDegraded: boolean) => void;
  onUploadProgress?: (count: number) => void;
  onBufferingStarted?: () => void;
  cooldown?: {
    defaultMs: number;
    p1Ms: number;
  };
}

export const useEventEvidenceCapture = ({
  contestId,
  module,
  enabled,
  intervalMs,
  uploadSessionId,
  captureFrameBlob,
  isStreamUnavailable,
  onStreamUnavailable,
  reportDegraded,
  onUploadProgress,
  onBufferingStarted,
  cooldown,
}: Options) => {
  const isCapturingRef = useRef(false);
  const captureTimerRef = useRef<ReturnType<typeof window.setInterval> | null>(null);
  const initialBufferAttemptedRef = useRef(false);
  const lastForcedCaptureByTypeRef = useRef<Map<string, number>>(new Map());
  const evidenceBufferRef = useRef<ReturnType<typeof createEvidenceRingBuffer> | null>(null);
  if (!evidenceBufferRef.current) {
    evidenceBufferRef.current = createEvidenceRingBuffer();
  }

  const { uploadBatchDetailed } = useAnticheatUploader(contestId, module);

  const captureToEvidenceBuffer = useCallback(async () => {
    if (isCapturingRef.current || !enabled) return;
    isCapturingRef.current = true;
    try {
      const blob = await captureFrameBlob();
      if (!blob) {
        if (isStreamUnavailable()) {
          onStreamUnavailable();
        }
        return;
      }
      evidenceBufferRef.current?.add(blob);
    } catch (err) {
      console.error(`[anticheat][${module}] evidence buffer capture failed:`, err);
    } finally {
      isCapturingRef.current = false;
    }
  }, [captureFrameBlob, enabled, isStreamUnavailable, module, onStreamUnavailable]);

  const flushPendingUploads = useCallback(async () => {
    // Event-keyed evidence intentionally has no background upload queue.
    reportDegraded?.(false);
  }, [reportDegraded]);

  const forceCaptureNow = useCallback(async (
    _reason: string,
    options?: ForcedCaptureOptions & { eventType?: string },
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

    if (cooldown) {
      const eventType = options?.eventType;
      const priority = eventType ? getEventPriority(eventType) : 1;
      const now = Date.now();
      if (priority > 0) {
        const cooldownMs = priority === 1 ? cooldown.p1Ms : cooldown.defaultMs;
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
    }

    const eventTimeMs = Date.now();
    const preBufferWindowStartMs = eventTimeMs - 20_000;
    const bufferedFrames = evidenceBufferRef.current?.getWindow(
      preBufferWindowStartMs,
      eventTimeMs,
    ) ?? [];
    const preBufferComplete =
      bufferedFrames.length > 0 && bufferedFrames[0].createdAt <= preBufferWindowStartMs + 1_000;

    const blob = await captureFrameBlob();
    if (!blob) {
      if (isStreamUnavailable()) {
        onStreamUnavailable();
      }
      return {
        attempted: true,
        captured: false,
        uploaded: false,
        skipped: "stream_unavailable",
        errorCode: "stream_unavailable",
        uploadSessionId: currentUploadSessionId,
        seq: null,
        evidencePreBufferAttempted: true,
        evidencePreBufferComplete: preBufferComplete,
        evidencePreBufferFrameCount: bufferedFrames.length,
      };
    }

    const currentEvidenceFrame = evidenceBufferRef.current?.add(blob, Date.now());
    const evidenceFrames = [
      ...bufferedFrames,
      ...(currentEvidenceFrame ? [currentEvidenceFrame] : []),
    ].filter((frame, index, all) => all.findIndex((item) => item.id === frame.id) === index);

    try {
      const uploadedFrames = await uploadBatchDetailed(
        evidenceFrames,
        uploadSessionId,
        onUploadProgress,
      );
      if (uploadedFrames.length > 0) {
        return {
          attempted: true,
          captured: true,
          uploaded: true,
          uploadSessionId: currentUploadSessionId,
          seq: uploadedFrames[uploadedFrames.length - 1]?.seq ?? currentEvidenceFrame?.id ?? null,
          uploadedSeqs: uploadedFrames.map((item) => item.seq),
          uploadedObjectKeys: uploadedFrames.map((item) => item.objectKey),
          evidencePreBufferAttempted: true,
          evidencePreBufferComplete: preBufferComplete,
          evidencePreBufferFrameCount: bufferedFrames.length,
          evidenceUploadedFrameCount: uploadedFrames.length,
        };
      }
    } catch {
      reportDegraded?.(true);
    }

    return {
      attempted: true,
      captured: true,
      uploaded: false,
      uploadSessionId: currentUploadSessionId,
      seq: currentEvidenceFrame?.id ?? null,
      evidencePreBufferAttempted: true,
      evidencePreBufferComplete: preBufferComplete,
      evidencePreBufferFrameCount: bufferedFrames.length,
    };
  }, [
    captureFrameBlob,
    contestId,
    cooldown,
    enabled,
    isStreamUnavailable,
    onStreamUnavailable,
    onUploadProgress,
    reportDegraded,
    uploadBatchDetailed,
    uploadSessionId,
  ]);

  const stopEvidenceCapture = useCallback(() => {
    const hadTimer = captureTimerRef.current != null;
    if (captureTimerRef.current) {
      clearInterval(captureTimerRef.current);
      captureTimerRef.current = null;
    }
    initialBufferAttemptedRef.current = false;
    evidenceBufferRef.current?.clear();
    return hadTimer;
  }, []);

  useEffect(() => {
    if (!enabled) {
      stopEvidenceCapture();
      return;
    }

    onBufferingStarted?.();
    captureTimerRef.current = setInterval(() => {
      void captureToEvidenceBuffer();
    }, intervalMs);

    return () => {
      if (captureTimerRef.current) {
        clearInterval(captureTimerRef.current);
        captureTimerRef.current = null;
      }
    };
  }, [captureToEvidenceBuffer, enabled, intervalMs, onBufferingStarted, stopEvidenceCapture]);

  useEffect(() => {
    if (!enabled) {
      initialBufferAttemptedRef.current = false;
      return;
    }
    if (initialBufferAttemptedRef.current) return;
    initialBufferAttemptedRef.current = true;
    void captureToEvidenceBuffer();
  }, [captureToEvidenceBuffer, enabled]);

  return {
    flushPendingUploads,
    forceCaptureNow,
    stopEvidenceCapture,
  };
};
