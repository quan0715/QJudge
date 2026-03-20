/**
 * useForceSubmitArbiter
 *
 * Single entry point for all timeout-triggered forced exam submissions.
 * Holds a CAS lock (submitInFlightRef) to prevent duplicate serviceEndExam
 * calls when multiple recovery timers expire near-simultaneously
 * (e.g. screen-share timeout and viewport timeout both fire within ms).
 *
 * Contract:
 *  - Callers pass recording/finalizing handlers. The arbiter owns the lock
 *    and calls submissionProgress.run with those handlers.
 *  - Every force-submit path (screen_share / webcam / viewport) must go
 *    through requestForceSubmit — no direct serviceEndExam in domain hooks.
 */
import { useCallback, useRef, useState } from "react";
import { endExam as serviceEndExam } from "@/infrastructure/api/repositories";
import { getExamCaptureSessionId } from "@/shared/state/examCaptureSessionStore";
import { stopCaptureForContest } from "@/features/contest/anticheat/captureLifecycle";
import type { CaptureStopReason } from "@/features/contest/anticheat/captureLifecycle";
import useExamSubmissionProgress from "@/features/contest/hooks/useExamSubmissionProgress";

export type ForceSubmitSourceModule = "screen_share" | "webcam";

export interface ForceSubmitRequest {
  /** Human-readable reason (stored in event log) */
  reason: string;
  /** Passed as source_module to serviceEndExam */
  sourceModule: ForceSubmitSourceModule;
  /** Key passed to stopCaptureForContest (and fallback forceStopCapture) */
  stopCaptureKey: CaptureStopReason;
  /**
   * Whether to stop webcam before screen capture (webcam-primary path)
   * or after (screen-share / viewport paths). Defaults to false (stop after).
   */
  stopWebcamFirst?: boolean;
  /** Optional recording-phase work (event logging, forced capture). */
  onRecording?: () => Promise<void>;
  /** Called in finally regardless of success/failure (e.g. clearReauth). */
  onFinally?: () => void;
}

export interface UseForceSubmitArbiterConfig {
  contestId: string;
  forceStopCapture: (reason?: CaptureStopReason) => void;
  forceStopWebcamCapture: () => void;
  beforeSubmitCapture?: () => Promise<void>;
  onRefresh?: () => Promise<void>;
  onSuccess?: () => void;
}

export interface UseForceSubmitArbiterReturn {
  requestForceSubmit: (req: ForceSubmitRequest) => Promise<void>;
  isForceSubmitting: boolean;
  submissionProgress: ReturnType<typeof useExamSubmissionProgress>;
}

export function useForceSubmitArbiter({
  contestId,
  forceStopCapture,
  forceStopWebcamCapture,
  beforeSubmitCapture,
  onRefresh,
  onSuccess,
}: UseForceSubmitArbiterConfig): UseForceSubmitArbiterReturn {
  const submissionProgress = useExamSubmissionProgress();
  const submitInFlightRef = useRef(false);
  const [isForceSubmitting, setIsForceSubmitting] = useState(false);

  const requestForceSubmit = useCallback(
    async (req: ForceSubmitRequest) => {
      // CAS lock — first caller wins, subsequent callers are silently dropped.
      if (submitInFlightRef.current) return;
      submitInFlightRef.current = true;
      setIsForceSubmitting(true);

      try {
        const success = await submissionProgress.run({
          handlers: {
            recording: req.onRecording,
            finalizing: async () => {
              if (beforeSubmitCapture) {
                await beforeSubmitCapture().catch(() => undefined);
              }
              await serviceEndExam(contestId, {
                upload_session_id: getExamCaptureSessionId(contestId) || undefined,
                source_module: req.sourceModule,
              });

              if (req.stopWebcamFirst) {
                forceStopWebcamCapture();
                const stopped = stopCaptureForContest(contestId, req.stopCaptureKey);
                if (!stopped) forceStopCapture(req.stopCaptureKey);
              } else {
                const stopped = stopCaptureForContest(contestId, req.stopCaptureKey);
                if (!stopped) forceStopCapture(req.stopCaptureKey);
                forceStopWebcamCapture();
              }

              if (onRefresh) await onRefresh();
            },
          },
        });

        if (success) onSuccess?.();
      } catch {
        // Best-effort: force submit errors must not block cleanup.
      } finally {
        setIsForceSubmitting(false);
        submitInFlightRef.current = false;
        req.onFinally?.();
      }
    },
    [
      contestId,
      forceStopCapture,
      forceStopWebcamCapture,
      beforeSubmitCapture,
      onRefresh,
      onSuccess,
      submissionProgress,
    ],
  );

  return { requestForceSubmit, isForceSubmitting, submissionProgress };
}
