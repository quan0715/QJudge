import { createContext, useContext } from "react";
import type {
  CaptureStopReason,
  CaptureStopResult,
} from "@/features/contest/anticheat/captureLifecycle";

export interface ExamCaptureContextValue {
  uploadSessionId: string | null;
  flushPendingUploads: () => Promise<void>;
  forceStopCapture: (reason?: CaptureStopReason) => CaptureStopResult;
}

const noopAsync = async () => undefined;
const noopStopCapture = (): CaptureStopResult => ({
  reason: "manual",
  status: "already_stopped",
  timestamp: new Date(0).toISOString(),
});

const DEFAULT_VALUE: ExamCaptureContextValue = {
  uploadSessionId: null,
  flushPendingUploads: noopAsync,
  forceStopCapture: noopStopCapture,
};

const ExamCaptureContext = createContext<ExamCaptureContextValue>(DEFAULT_VALUE);

export const ExamCaptureProvider = ExamCaptureContext.Provider;

export const useExamCapture = (): ExamCaptureContextValue => useContext(ExamCaptureContext);
