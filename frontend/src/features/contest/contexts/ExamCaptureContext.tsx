import { createContext, useContext } from "react";
import type {
  ForcedCaptureOptions,
  ForcedCaptureResult,
} from "@/features/contest/anticheat/forcedCapture";
import type {
  CaptureStopReason,
  CaptureStopResult,
} from "@/features/contest/anticheat/captureLifecycle";

export interface ExamCaptureContextValue {
  uploadSessionId: string | null;
  flushPendingUploads: () => Promise<void>;
  forceStopCapture: (reason?: CaptureStopReason) => CaptureStopResult;
  forceCaptureNow: (
    reason: string,
    options?: ForcedCaptureOptions
  ) => Promise<ForcedCaptureResult>;
}

const noopAsync = async () => undefined;
const noopForceCapture = async (): Promise<ForcedCaptureResult> => ({
  attempted: false,
  captured: false,
  uploaded: false,
  skipped: "capture_unavailable",
  errorCode: "capture_unavailable",
  uploadSessionId: null,
  seq: null,
});
const noopStopCapture = (): CaptureStopResult => ({
  reason: "manual",
  status: "already_stopped",
  timestamp: new Date(0).toISOString(),
});

const DEFAULT_VALUE: ExamCaptureContextValue = {
  uploadSessionId: null,
  flushPendingUploads: noopAsync,
  forceStopCapture: noopStopCapture,
  forceCaptureNow: noopForceCapture,
};

const ExamCaptureContext = createContext<ExamCaptureContextValue>(DEFAULT_VALUE);

export const ExamCaptureProvider = ExamCaptureContext.Provider;

export const useExamCapture = (): ExamCaptureContextValue => useContext(ExamCaptureContext);
