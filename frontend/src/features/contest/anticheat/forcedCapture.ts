import {
  recordExamEvent,
  type ExamEventResponse,
  type RecordExamEventOptions,
} from "@/infrastructure/api/repositories";
import { getExamCaptureSessionId } from "@/features/contest/screens/paperExam/hooks/examCaptureSession";

export type ForcedCaptureSkipReason =
  | "disabled"
  | "cooldown"
  | "stream_unavailable"
  | "capture_unavailable";

export interface ForcedCaptureOptions {
  allowStreamRecovery?: boolean;
}

export interface ForcedCaptureResult {
  attempted: boolean;
  captured: boolean;
  uploaded: boolean;
  skipped?: ForcedCaptureSkipReason;
  errorCode?: string;
  uploadSessionId: string | null;
  seq: number | null;
}

export interface RecordExamEventWithCaptureOptions extends RecordExamEventOptions {
  forceCaptureReason?: string;
  captureOptions?: ForcedCaptureOptions;
}

type ForceCaptureHandler = (
  reason: string,
  options?: ForcedCaptureOptions
) => Promise<ForcedCaptureResult>;

const captureHandlers = new Map<string, ForceCaptureHandler>();

const unavailableCaptureResult = (
  contestId: string,
  errorCode = "capture_unavailable"
): ForcedCaptureResult => ({
  attempted: false,
  captured: false,
  uploaded: false,
  skipped: "capture_unavailable",
  errorCode,
  uploadSessionId: getExamCaptureSessionId(contestId) || null,
  seq: null,
});

const toForcedCaptureResultLabel = (result: ForcedCaptureResult): string => {
  if (result.skipped) return `skipped:${result.skipped}`;
  if (result.uploaded) return "uploaded";
  if (result.captured) return "captured";
  if (result.attempted) return "attempted";
  return "not_attempted";
};

export const registerForcedCaptureHandler = (
  contestId: string,
  handler: ForceCaptureHandler
) => {
  if (!contestId) return;
  captureHandlers.set(contestId, handler);
};

export const unregisterForcedCaptureHandler = (
  contestId: string,
  handler?: ForceCaptureHandler
) => {
  if (!contestId) return;
  if (!handler) {
    captureHandlers.delete(contestId);
    return;
  }
  const current = captureHandlers.get(contestId);
  if (current === handler) {
    captureHandlers.delete(contestId);
  }
};

export const forceCaptureForContest = async (
  contestId: string,
  reason: string,
  options?: ForcedCaptureOptions
): Promise<ForcedCaptureResult> => {
  const handler = captureHandlers.get(contestId);
  if (!handler) {
    return unavailableCaptureResult(contestId);
  }

  try {
    return await handler(reason, options);
  } catch (error) {
    return unavailableCaptureResult(
      contestId,
      error instanceof Error && error.message ? error.message : "capture_runtime_error"
    );
  }
};

export const buildForcedCaptureMetadata = (
  contestId: string,
  reason: string,
  result: ForcedCaptureResult
): Record<string, unknown> => ({
  forced_capture_requested: true,
  forced_capture_reason: reason,
  forced_capture_result: toForcedCaptureResultLabel(result),
  forced_capture_attempted: result.attempted,
  forced_capture_captured: result.captured,
  forced_capture_uploaded: result.uploaded,
  ...(result.skipped ? { forced_capture_skipped: result.skipped } : {}),
  ...(result.errorCode ? { forced_capture_error_code: result.errorCode } : {}),
  ...(typeof result.seq === "number" ? { forced_capture_seq: result.seq } : {}),
  upload_session_id:
    result.uploadSessionId || getExamCaptureSessionId(contestId) || undefined,
});

export const recordExamEventWithForcedCapture = async (
  contestId: string,
  eventType: string,
  options?: RecordExamEventWithCaptureOptions
): Promise<ExamEventResponse | null> => {
  const captureReason = options?.forceCaptureReason || eventType;
  const captureResult = await forceCaptureForContest(
    contestId,
    captureReason,
    options?.captureOptions
  );

  const mergedMetadata = {
    ...(options?.metadata || {}),
    ...buildForcedCaptureMetadata(contestId, captureReason, captureResult),
  };

  return recordExamEvent(contestId, eventType, {
    ...options,
    metadata: mergedMetadata,
  });
};
