import { createContext, useContext } from "react";
import type { IntegrityJsonValue } from "@/core/entities/examIntegrity.entity";

export interface IntegritySignalEmitter {
  emit(signal: IntegritySignal): Promise<void>;
}

export interface IntegritySignal {
  eventType: string;
  clientOccurredAtMs: number;
  payload: Record<string, IntegrityJsonValue>;
}

export const INTEGRITY_SIGNAL_EVENT = "qjudge:integrity-signal";

interface IntegritySignalDispatchDetail {
  signal: IntegritySignal;
  completion?: Promise<void>;
}

/**
 * Layout-level actions sit above ExamModeWrapper in the React tree. The inactive
 * context value relays their generic signal to the single active runtime owner
 * without creating another transport or a direct API path.
 */
const inactiveEmitter: IntegritySignalEmitter = {
  emit: (signal) => {
    if (typeof window === "undefined") return Promise.resolve();
    const detail: IntegritySignalDispatchDetail = { signal };
    window.dispatchEvent(
      new CustomEvent<IntegritySignalDispatchDetail>(INTEGRITY_SIGNAL_EVENT, {
        detail,
      }),
    );
    return detail.completion ?? Promise.resolve();
  },
};

export const asIntegritySignalDispatch = (
  event: Event,
): IntegritySignalDispatchDetail | null => {
  if (!(event instanceof CustomEvent)) return null;
  const detail = event.detail as IntegritySignalDispatchDetail | undefined;
  return detail?.signal ? detail : null;
};

const IntegrityRuntimeContext = createContext<IntegritySignalEmitter>(
  inactiveEmitter,
);

export const IntegrityRuntimeProvider = IntegrityRuntimeContext.Provider;

export const useIntegritySignalEmitter = (): IntegritySignalEmitter =>
  useContext(IntegrityRuntimeContext);
