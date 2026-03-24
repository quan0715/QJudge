import {
  recordExamEvent,
  type ExamEventResponse,
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
}

export interface ForcedCaptureModuleResult {
  attempted: boolean;
  captured: boolean;
  uploaded: boolean;
  skipped?: ForcedCaptureSkipReason;
  errorCode?: string;
  uploadSessionId: string | null;
  seq: number | null;
}

export interface ForcedCaptureResult {
  attempted: boolean;
  captured: boolean;
  uploaded: boolean;
  skipped?: ForcedCaptureSkipReason;
  errorCode?: string;
  uploadSessionId: string | null;
  seq: number | null;
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

export const forceCaptureForContest = async (
  contestId: string,
  reason: string,
  options?: ForcedCaptureOptions & { eventType?: string }
): Promise<ForcedCaptureResult> => {
  const moduleHandlers = captureHandlers.get(contestId);
  if (!moduleHandlers || moduleHandlers.size === 0) {
    return unavailableCaptureResult(contestId);
  }

  const requestedModules =
    options?.modules?.filter((module): module is ForcedCaptureModule =>
      CAPTURE_MODULES.includes(module)
    ) ?? [];
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
  ...(result.modules?.length ? { forced_capture_modules: result.modules } : {}),
  ...(result.module_results ? { forced_capture_module_results: result.module_results } : {}),
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
