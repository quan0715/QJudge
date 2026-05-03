import {
  recordExamEvent,
  type ExamEventResponse,
  type EvidenceMode,
  type RecordExamEventOptions,
} from "@/infrastructure/api/repositories";
import { getExamCaptureSessionId } from "@/shared/state/examCaptureSessionStore";

export type ForcedCaptureSkipReason =
  | "disabled"
  | "cooldown"
  | "stream_unavailable"
  | "capture_unavailable";

export type ForcedCaptureModule = "screen_share" | "webcam";

export interface ForcedCaptureOptions {
  allowStreamRecovery?: boolean;
  modules?: ForcedCaptureModule[];
  eventId?: number | string;
  evidenceClusterId?: string;
  evidenceMode?: EvidenceMode;
  evidenceAnchorAtMs?: number;
  evidenceWindowStart?: string;
  evidenceWindowEnd?: string;
}

export interface ForcedCaptureModuleResult {
  attempted: boolean;
  captured: boolean;
  uploaded: boolean;
  skipped?: ForcedCaptureSkipReason;
  errorCode?: string;
  uploadSessionId: string | null;
  seq: number | null;
  uploadedSeqs?: number[];
  uploadedObjectKeys?: string[];
  evidenceFrameIds?: number[];
  clientCapturedAtMs?: number[];
  evidencePreBufferAttempted?: boolean;
  evidencePreBufferComplete?: boolean;
  evidencePreBufferFrameCount?: number;
  evidenceUploadedFrameCount?: number;
}

export interface ForcedCaptureResult {
  attempted: boolean;
  captured: boolean;
  uploaded: boolean;
  skipped?: ForcedCaptureSkipReason;
  errorCode?: string;
  uploadSessionId: string | null;
  seq: number | null;
  uploadedSeqs?: number[];
  uploadedObjectKeys?: string[];
  evidenceFrameIds?: number[];
  clientCapturedAtMs?: number[];
  evidencePreBufferAttempted?: boolean;
  evidencePreBufferComplete?: boolean;
  evidencePreBufferFrameCount?: number;
  evidenceUploadedFrameCount?: number;
  modules?: ForcedCaptureModule[];
  module_results?: Partial<Record<ForcedCaptureModule, ForcedCaptureModuleResult>>;
}

export interface RecordExamEventWithCaptureOptions extends RecordExamEventOptions {
  forceCaptureReason?: string;
  captureOptions?: ForcedCaptureOptions & { eventType?: string };
}

export type ForceCaptureHandler = (
  reason: string,
  options?: ForcedCaptureOptions & { eventType?: string }
) => Promise<ForcedCaptureResult>;

const CAPTURE_MODULES: ForcedCaptureModule[] = ["screen_share", "webcam"];
const captureHandlers = new Map<string, Map<ForcedCaptureModule, ForceCaptureHandler>>();

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
  module: ForcedCaptureModule,
  handler: ForceCaptureHandler
) => {
  if (!contestId) return;
  const moduleHandlers = captureHandlers.get(contestId) ?? new Map<ForcedCaptureModule, ForceCaptureHandler>();
  moduleHandlers.set(module, handler);
  captureHandlers.set(contestId, moduleHandlers);
};

export const unregisterForcedCaptureHandler = (
  contestId: string,
  module?: ForcedCaptureModule,
  handler?: ForceCaptureHandler
) => {
  if (!contestId) return;
  if (!module) {
    captureHandlers.delete(contestId);
    return;
  }
  const moduleHandlers = captureHandlers.get(contestId);
  if (!moduleHandlers) return;
  const current = moduleHandlers.get(module);
  if (!handler || current === handler) {
    moduleHandlers.delete(module);
  }
  if (moduleHandlers.size === 0) {
    captureHandlers.delete(contestId);
  }
};

const toModuleResult = (result: ForcedCaptureResult): ForcedCaptureModuleResult => ({
  attempted: result.attempted,
  captured: result.captured,
  uploaded: result.uploaded,
  skipped: result.skipped,
  errorCode: result.errorCode,
  uploadSessionId: result.uploadSessionId,
  seq: result.seq,
  uploadedSeqs: result.uploadedSeqs,
  uploadedObjectKeys: result.uploadedObjectKeys,
  evidenceFrameIds: result.evidenceFrameIds,
  clientCapturedAtMs: result.clientCapturedAtMs,
  evidencePreBufferAttempted: result.evidencePreBufferAttempted,
  evidencePreBufferComplete: result.evidencePreBufferComplete,
  evidencePreBufferFrameCount: result.evidencePreBufferFrameCount,
  evidenceUploadedFrameCount: result.evidenceUploadedFrameCount,
});

const pickPrimaryResult = (results: ForcedCaptureModuleResult[]): ForcedCaptureModuleResult => {
  const uploaded = results.find((item) => item.uploaded);
  if (uploaded) return uploaded;
  const captured = results.find((item) => item.captured);
  if (captured) return captured;
  const attempted = results.find((item) => item.attempted);
  if (attempted) return attempted;
  return results[0];
};

const aggregateModuleResults = (
  results?: Partial<Record<ForcedCaptureModule, ForcedCaptureModuleResult>>
) => {
  const moduleResults = results ? Object.values(results).filter(Boolean) : [];
  return {
    uploadedSeqs: moduleResults.flatMap((result) => result.uploadedSeqs ?? []),
    uploadedObjectKeys: moduleResults.flatMap((result) => result.uploadedObjectKeys ?? []),
    evidenceFrameIds: moduleResults.flatMap((result) => result.evidenceFrameIds ?? []),
    clientCapturedAtMs: moduleResults.flatMap((result) => result.clientCapturedAtMs ?? []),
    uploadedFrameCount: moduleResults.reduce(
      (sum, result) => sum + (result.evidenceUploadedFrameCount ?? 0),
      0
    ),
  };
};

export const forceCaptureForContest = async (
  contestId: string,
  reason: string,
  options?: ForcedCaptureOptions & { eventType?: string }
): Promise<ForcedCaptureResult> => {
  const moduleHandlers = captureHandlers.get(contestId);
  if (!moduleHandlers || moduleHandlers.size === 0) {
    return unavailableCaptureResult(contestId);
  }

  const hasExplicitModules = Array.isArray(options?.modules);
  const requestedModules =
    options?.modules?.filter((module): module is ForcedCaptureModule =>
      CAPTURE_MODULES.includes(module)
    ) ?? [];
  if (hasExplicitModules && requestedModules.length === 0) {
    return unavailableCaptureResult(contestId);
  }
  const targetModules =
    requestedModules.length > 0
      ? requestedModules.filter((module) => moduleHandlers.has(module))
      : (() => {
          const preferred = CAPTURE_MODULES.find((module) => moduleHandlers.has(module));
          return preferred ? [preferred] : [];
        })();

  if (targetModules.length === 0) {
    return unavailableCaptureResult(contestId);
  }

  const moduleResults: Partial<Record<ForcedCaptureModule, ForcedCaptureModuleResult>> = {};
  const settled = await Promise.all(
    targetModules.map(async (module) => {
      const handler = moduleHandlers.get(module);
      if (!handler) return;
      try {
        const result = await handler(reason, options);
        moduleResults[module] = toModuleResult(result);
      } catch (error) {
        moduleResults[module] = toModuleResult(
          unavailableCaptureResult(
            contestId,
            error instanceof Error && error.message ? error.message : "capture_runtime_error"
          )
        );
      }
    })
  );
  void settled;

  const nonEmptyResults = targetModules
    .map((module) => moduleResults[module])
    .filter((item): item is ForcedCaptureModuleResult => !!item);
  if (nonEmptyResults.length === 0) {
    return unavailableCaptureResult(contestId);
  }

  const primary = pickPrimaryResult(nonEmptyResults);
  return {
    ...primary,
    modules: targetModules,
    module_results: moduleResults,
  };
};

export const buildForcedCaptureMetadata = (
  contestId: string,
  reason: string,
  result: ForcedCaptureResult
): Record<string, unknown> => {
  const aggregate = aggregateModuleResults(result.module_results);
  const uploadedSeqs = aggregate.uploadedSeqs.length > 0
    ? aggregate.uploadedSeqs
    : result.uploadedSeqs;
  const uploadedObjectKeys = aggregate.uploadedObjectKeys.length > 0
    ? aggregate.uploadedObjectKeys
    : result.uploadedObjectKeys;
  const evidenceFrameIds = aggregate.evidenceFrameIds.length > 0
    ? aggregate.evidenceFrameIds
    : result.evidenceFrameIds;
  const clientCapturedAtMs = aggregate.clientCapturedAtMs.length > 0
    ? aggregate.clientCapturedAtMs
    : result.clientCapturedAtMs;
  const uploadedFrameCount = aggregate.uploadedFrameCount > 0
    ? aggregate.uploadedFrameCount
    : result.evidenceUploadedFrameCount;

  return {
    forced_capture_requested: true,
    forced_capture_reason: reason,
    forced_capture_result: toForcedCaptureResultLabel(result),
    forced_capture_attempted: result.attempted,
    forced_capture_captured: result.captured,
    forced_capture_uploaded: result.uploaded,
    ...(result.skipped ? { forced_capture_skipped: result.skipped } : {}),
    ...(result.errorCode ? { forced_capture_error_code: result.errorCode } : {}),
    ...(typeof result.seq === "number" ? { forced_capture_seq: result.seq } : {}),
    ...(uploadedSeqs?.length ? { forced_capture_uploaded_seqs: uploadedSeqs } : {}),
    ...(uploadedObjectKeys?.length
      ? { forced_capture_uploaded_object_keys: uploadedObjectKeys }
      : {}),
    ...(evidenceFrameIds?.length ? { evidence_frame_ids: evidenceFrameIds } : {}),
    ...(clientCapturedAtMs?.length ? { evidence_client_captured_at_ms: clientCapturedAtMs } : {}),
    ...(typeof result.evidencePreBufferAttempted === "boolean"
      ? { evidence_pre_buffer_attempted: result.evidencePreBufferAttempted }
      : {}),
    ...(typeof result.evidencePreBufferComplete === "boolean"
      ? {
          evidence_pre_buffer_complete: result.evidencePreBufferComplete,
          pre_buffer_complete: result.evidencePreBufferComplete,
        }
      : {}),
    ...(typeof result.evidencePreBufferFrameCount === "number"
      ? { evidence_pre_buffer_frame_count: result.evidencePreBufferFrameCount }
      : {}),
    ...(typeof uploadedFrameCount === "number"
      ? { evidence_uploaded_frame_count: uploadedFrameCount }
      : {}),
    ...(result.modules?.length ? { forced_capture_modules: result.modules } : {}),
    ...(result.module_results ? { forced_capture_module_results: result.module_results } : {}),
    upload_session_id:
      result.uploadSessionId || getExamCaptureSessionId(contestId) || undefined,
  };
};

const STREAM_LOSS_EVENT_TYPES = new Set(["screen_share_stopped", "webcam_stopped"]);

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return Math.round(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return Math.round(parsed);
  }
  return null;
};

const resolveEvidenceMode = (
  eventType: string,
  options?: RecordExamEventWithCaptureOptions
): EvidenceMode => {
  if (options?.captureOptions?.evidenceMode) {
    return options.captureOptions.evidenceMode;
  }
  const metadataMode = options?.metadata?.evidence_mode;
  if (metadataMode === "pre_loss" || metadataMode === "anchor_window" || metadataMode === "audit") {
    return metadataMode;
  }
  return STREAM_LOSS_EVENT_TYPES.has(eventType) ? "pre_loss" : "anchor_window";
};

export const recordExamEventWithForcedCapture = async (
  contestId: string,
  eventType: string,
  options?: RecordExamEventWithCaptureOptions
): Promise<ExamEventResponse | null> => {
  const captureReason = options?.forceCaptureReason || eventType;
  const originalMetadata = options?.metadata || {};
  const anchorMs =
    toNumber(originalMetadata.evidence_anchor_at_ms) ??
    toNumber(originalMetadata.client_observed_at_ms) ??
    Date.now();
  const evidenceMode = resolveEvidenceMode(eventType, options);
  const mergedMetadata = {
    ...originalMetadata,
    forced_capture_requested: true,
    forced_capture_reason: captureReason,
    evidence_anchor_at_ms: anchorMs,
    client_observed_at_ms: toNumber(originalMetadata.client_observed_at_ms) ?? anchorMs,
    evidence_mode: evidenceMode,
    upload_session_id:
      originalMetadata.upload_session_id || getExamCaptureSessionId(contestId) || undefined,
  };

  const response = await recordExamEvent(contestId, eventType, {
    ...options,
    metadata: mergedMetadata,
  });

  if (!response?.event_id) {
    return response;
  }

  void forceCaptureForContest(contestId, captureReason, {
    ...(options?.captureOptions || {}),
    eventType,
    eventId: response.event_id,
    evidenceClusterId: response.evidence_cluster_id,
    evidenceMode: response.evidence_mode || evidenceMode,
    evidenceAnchorAtMs: response.evidence_anchor_at_ms ?? anchorMs,
    evidenceWindowStart: response.evidence_window_start,
    evidenceWindowEnd: response.evidence_window_end,
  }).catch(() => undefined);

  return response;
};
