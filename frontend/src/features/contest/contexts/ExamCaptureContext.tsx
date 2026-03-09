import { createContext, useContext } from "react";
import type {
  ForcedCaptureOptions,
  ForcedCaptureResult,
} from "@/features/contest/anticheat/forcedCapture";

export interface ExamCaptureContextValue {
  uploadSessionId: string | null;
  flushPendingUploads: () => Promise<void>;
  forceStopCapture: () => void;
  forceCaptureNow: (
    reason: string,
    options?: ForcedCaptureOptions
  ) => Promise<ForcedCaptureResult>;
}

const noopAsync = async () => undefined;
const noop = () => undefined;
const noopForceCapture = async (): Promise<ForcedCaptureResult> => ({
  attempted: false,
  captured: false,
  uploaded: false,
  skipped: "capture_unavailable",
  errorCode: "capture_unavailable",
  uploadSessionId: null,
  seq: null,
});

const DEFAULT_VALUE: ExamCaptureContextValue = {
  uploadSessionId: null,
  flushPendingUploads: noopAsync,
  forceStopCapture: noop,
  forceCaptureNow: noopForceCapture,
};

const ExamCaptureContext = createContext<ExamCaptureContextValue>(DEFAULT_VALUE);

export const ExamCaptureProvider = ExamCaptureContext.Provider;

export const useExamCapture = (): ExamCaptureContextValue => useContext(ExamCaptureContext);
