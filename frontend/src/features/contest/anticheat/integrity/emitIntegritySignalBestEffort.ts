import type {
  IntegritySignal,
  IntegritySignalEmitter,
} from "./IntegrityRuntimeContext";

/**
 * A user-initiated submit must not be held hostage by local outbox storage.
 * The signal is still attempted and failures remain observable in the console.
 *
 * The emitters shipped today already resolve on every failure path, so this
 * catch is normally unreachable. Keep it anyway: this is the boundary that lets
 * submission stop depending on that implementation detail, and
 * useExamSessionFlow.test.ts pins the behaviour with a rejecting emitter.
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
