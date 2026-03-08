import { createContext, useContext } from "react";

export interface ExamCaptureContextValue {
  uploadSessionId: string | null;
  flushPendingUploads: () => Promise<void>;
  forceStopCapture: () => void;
}

const noopAsync = async () => undefined;
const noop = () => undefined;

const DEFAULT_VALUE: ExamCaptureContextValue = {
  uploadSessionId: null,
  flushPendingUploads: noopAsync,
  forceStopCapture: noop,
};

const ExamCaptureContext = createContext<ExamCaptureContextValue>(DEFAULT_VALUE);

export const ExamCaptureProvider = ExamCaptureContext.Provider;

export const useExamCapture = (): ExamCaptureContextValue => useContext(ExamCaptureContext);
