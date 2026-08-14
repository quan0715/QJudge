import type {
  IntegritySignal,
  IntegritySignalEmitter,
} from "./IntegrityRuntimeContext";

/**
 * A user-initiated submit must not be held hostage by local outbox storage.
 * The signal is still attempted and failures remain observable in the console.
 */
export const emitIntegritySignalBestEffort = async (
  emitter: IntegritySignalEmitter,
  signal: IntegritySignal,
): Promise<void> => {
  try {
    await emitter.emit(signal);
  } catch (error) {
    console.warn("Failed to append optional integrity lifecycle signal", error);
  }
};
