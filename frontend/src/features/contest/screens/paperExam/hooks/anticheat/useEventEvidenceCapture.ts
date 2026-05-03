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

const EVIDENCE_BUFFER_CAPTURE_INTERVAL_MS = 1_000;
const ANCHOR_WINDOW_RADIUS_MS = 3_000;
const PRE_LOSS_WINDOW_MS = 6_000;
const MAX_WINDOW_WAIT_MS = 4_000;

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

const parseWindowTime = (value?: string): number | null => {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const useEventEvidenceCapture = ({
  contestId,
  module,
  enabled,
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
    if (isCapturingRef.current || !enabled) return null;
    isCapturingRef.current = true;
    try {
      const blob = await captureFrameBlob();
      if (!blob) {
        if (isStreamUnavailable()) {
          onStreamUnavailable();
        }
        return null;
      }
      return evidenceBufferRef.current?.add(blob) ?? null;
    } catch (err) {
      console.error(`[anticheat][${module}] evidence buffer capture failed:`, err);
      return null;
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

    if (!options?.eventId) {
      const frame = await captureToEvidenceBuffer();
      return {
        attempted: true,
        captured: !!frame,
        uploaded: false,
        skipped: "capture_unavailable",
        errorCode: "missing_evidence_event_id",
        uploadSessionId: currentUploadSessionId,
        seq: frame?.id ?? null,
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

    const evidenceMode = options.evidenceMode ?? (
      options.eventType === "screen_share_stopped" || options.eventType === "webcam_stopped"
        ? "pre_loss"
        : "anchor_window"
    );
    const anchorMs = options.evidenceAnchorAtMs ?? Date.now();
    const windowStartMs =
      parseWindowTime(options.evidenceWindowStart) ??
      (evidenceMode === "pre_loss" ? anchorMs - PRE_LOSS_WINDOW_MS : anchorMs - ANCHOR_WINDOW_RADIUS_MS);
    const windowEndMs =
      parseWindowTime(options.evidenceWindowEnd) ??
      (evidenceMode === "pre_loss" ? anchorMs : anchorMs + ANCHOR_WINDOW_RADIUS_MS);

    if (evidenceMode !== "pre_loss") {
      const waitMs = Math.min(Math.max(windowEndMs - Date.now(), 0), MAX_WINDOW_WAIT_MS);
      if (waitMs > 0) {
        await sleep(waitMs);
      }
    }

    if (evidenceMode !== "pre_loss" && Date.now() <= windowEndMs + 500) {
      const blob = await captureFrameBlob();
      if (blob) {
        evidenceBufferRef.current?.add(blob, Date.now());
      } else if (isStreamUnavailable()) {
        onStreamUnavailable();
      }
    }

    const bufferedFrames = evidenceBufferRef.current?.getWindow(windowStartMs, windowEndMs) ?? [];
    const preBufferComplete =
      bufferedFrames.length > 0 && bufferedFrames[0].createdAt <= windowStartMs + EVIDENCE_BUFFER_CAPTURE_INTERVAL_MS;
    const evidenceFrames = bufferedFrames.filter(
      (frame, index, all) => all.findIndex((item) => item.id === frame.id) === index
    );

    try {
      const uploadedFrames = await uploadBatchDetailed(
        evidenceFrames,
        currentUploadSessionId,
        onUploadProgress,
        {
          eventId: options.eventId,
          evidenceClusterId: options.evidenceClusterId,
          evidenceMode,
          sourceModule: module,
          unavailableReason: evidenceFrames.length ? undefined : "ring_buffer_empty",
        },
      );
      if (uploadedFrames.length > 0) {
        return {
          attempted: true,
          captured: true,
          uploaded: true,
          uploadSessionId: currentUploadSessionId,
          seq: uploadedFrames[uploadedFrames.length - 1]?.seq ?? null,
          uploadedSeqs: uploadedFrames.map((item) => item.seq),
          uploadedObjectKeys: uploadedFrames.map((item) => item.objectKey),
          evidenceFrameIds: uploadedFrames.map((item) => item.evidenceFrameId),
          clientCapturedAtMs: uploadedFrames.map((item) => item.createdAt),
          evidencePreBufferAttempted: true,
          evidencePreBufferComplete: preBufferComplete,
          evidencePreBufferFrameCount: bufferedFrames.length,
          evidenceUploadedFrameCount: uploadedFrames.length,
        };
      }
    } catch {
      reportDegraded?.(true);
    }

    const hasFrames = evidenceFrames.length > 0;
    return {
      attempted: true,
      captured: hasFrames,
      uploaded: false,
      ...(!hasFrames
        ? {
            skipped:
              evidenceMode === "pre_loss" && isStreamUnavailable()
                ? "stream_unavailable" as const
                : "capture_unavailable" as const,
            errorCode: "ring_buffer_empty",
          }
        : {}),
      uploadSessionId: currentUploadSessionId,
      seq: evidenceFrames[evidenceFrames.length - 1]?.id ?? null,
      evidencePreBufferAttempted: true,
      evidencePreBufferComplete: preBufferComplete,
      evidencePreBufferFrameCount: bufferedFrames.length,
    };
  }, [
    captureFrameBlob,
    captureToEvidenceBuffer,
    contestId,
    cooldown,
    enabled,
    isStreamUnavailable,
    module,
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
    }, EVIDENCE_BUFFER_CAPTURE_INTERVAL_MS);

    return () => {
      if (captureTimerRef.current) {
        clearInterval(captureTimerRef.current);
        captureTimerRef.current = null;
      }
    };
  }, [captureToEvidenceBuffer, enabled, onBufferingStarted, stopEvidenceCapture]);

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
