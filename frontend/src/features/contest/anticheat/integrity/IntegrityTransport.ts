import type {
  EvidenceRetainCommand,
  ExamIntegrityBatchAck,
  ExamIntegrityStateSnapshot,
} from "@/core/entities/examIntegrity.entity";
import type { ExamIntegrityOutbox } from "@/core/ports/examIntegrity.port";
import type { ExamIntegrityRepository } from "@/infrastructure/api/repositories/examIntegrity.repository";

const TRANSPORT_INTERVAL_MS = 5_000;
const MAX_BATCH_RECORDS = 200;
const MAX_BATCH_BYTES = 1_048_576;
const MAX_RETRY_DELAY_MS = 30_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

interface HttpFailure extends Error {
  status?: number;
}

export interface IntegrityTransportOptions {
  contestId: string;
  outbox: ExamIntegrityOutbox;
  repository: Pick<ExamIntegrityRepository, "sendBatch">;
  snapshotProvider: () => ExamIntegrityStateSnapshot;
  onPendingCommand?: (command: EvidenceRetainCommand) => void | Promise<void>;
  onReleaseEvidenceBeforeMs?: (releaseBeforeMs: number) => void | Promise<void>;
  onAuthenticationFailure?: (error: Error) => void | Promise<void>;
  isOnline?: () => boolean;
  now?: () => number;
  random?: () => number;
  eventTarget?: EventTarget;
  requestTimeoutMs?: number;
}

const statusOf = (error: unknown): number | undefined => {
  if (typeof error !== "object" || error === null) return undefined;
  const status = (error as HttpFailure).status;
  return typeof status === "number" ? status : undefined;
};

const asError = (error: unknown): Error =>
  error instanceof Error ? error : new Error("Integrity transport failed");

const defaultOnlineState = (): boolean =>
  typeof navigator === "undefined" || navigator.onLine;

/**
 * Feature-level scheduler only. It never decides anti-cheat policy; durable
 * records are always created by the outbox before this transport sends one
 * bounded batch to the Backend gateway.
 */
export class IntegrityTransport {
  private readonly options: IntegrityTransportOptions;
  private readonly eventTarget: EventTarget | undefined;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private tickInFlight = false;
  private retryAttempt = 0;
  private nextEligibleAtMs = 0;
  private generation = 0;
  private cancelCurrentRequest: (() => void) | null = null;
  private readonly onlineHandler = () => {
    // Reconnect uses the existing outbox lease and does not create a special
    // direct path, but it must not wait behind a stale exponential backoff.
    this.retryAttempt = 0;
    this.nextEligibleAtMs = 0;
    this.requestTick();
  };
  private readonly pageHideHandler = () => this.requestTick();

  constructor(options: IntegrityTransportOptions) {
    this.options = options;
    this.eventTarget = options.eventTarget;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.generation += 1;
    this.eventTarget?.addEventListener("online", this.onlineHandler);
    this.eventTarget?.addEventListener("pagehide", this.pageHideHandler);
    this.requestTick();
    this.intervalId = setInterval(() => this.requestTick(), TRANSPORT_INTERVAL_MS);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.generation += 1;
    this.cancelCurrentRequest?.();
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.eventTarget?.removeEventListener("online", this.onlineHandler);
    this.eventTarget?.removeEventListener("pagehide", this.pageHideHandler);
  }

  requestTick(): void {
    if (!this.running || this.tickInFlight) return;
    void this.tick();
  }

  private async tick(): Promise<void> {
    if (!this.running || this.tickInFlight) return;
    this.tickInFlight = true;
    const generation = this.generation;
    try {
      const snapshot = this.options.snapshotProvider();
      await this.options.outbox.append({
        eventType: "state_snapshot",
        clientOccurredAtMs: this.now(),
        payload: snapshot,
      });
      if (!this.isActive(generation)) return;
      if (!this.isOnline() || this.now() < this.nextEligibleAtMs) return;

      const batch = await this.options.outbox.claimBatch({
        maxRecords: MAX_BATCH_RECORDS,
        maxBytes: MAX_BATCH_BYTES,
      });
      if (!this.isActive(generation)) return;
      if (!batch) return;

      try {
        const ack = await this.sendBatchWithDeadline(batch);
        if (!this.isActive(generation)) return;
        await this.options.outbox.ackThrough(batch.runId, batch.deviceId, ack.ackedThroughSeq);
        if (!this.isActive(generation)) return;
        this.retryAttempt = 0;
        this.nextEligibleAtMs = 0;
        await this.applyAckCallbacks(ack, generation);
      } catch (error) {
        if (!this.isActive(generation)) return;
        await this.handleSendFailure(batch.batchId, error, generation);
      }
    } finally {
      this.tickInFlight = false;
    }
  }

  private async sendBatchWithDeadline(
    batch: Parameters<ExamIntegrityRepository["sendBatch"]>[1],
  ): Promise<ExamIntegrityBatchAck> {
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let rejectCancellation: ((error: Error) => void) | null = null;
    const cancellation = new Promise<never>((_resolve, reject) => {
      rejectCancellation = reject;
    });
    this.cancelCurrentRequest = () => {
      controller.abort();
      rejectCancellation?.(new Error("Integrity transport stopped"));
    };
    const deadline = new Promise<never>((_resolve, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        reject(new Error("Integrity batch request timed out"));
      }, this.requestTimeoutMs());
    });
    try {
      return await Promise.race([
        this.options.repository.sendBatch(this.options.contestId, batch, controller.signal),
        deadline,
        cancellation,
      ]);
    } finally {
      if (timeoutId !== null) clearTimeout(timeoutId);
      this.cancelCurrentRequest = null;
    }
  }

  private async applyAckCallbacks(ack: ExamIntegrityBatchAck, generation: number): Promise<void> {
    for (const command of ack.pendingCommands) {
      try {
        await this.options.onPendingCommand?.(command);
      } catch {
        // Pending evidence commands are repeated by the Backend until complete.
      }
      if (!this.isActive(generation)) return;
    }
    try {
      await this.options.onReleaseEvidenceBeforeMs?.(ack.releaseEvidenceBeforeMs);
    } catch {
      // The local evidence coordinator retries release work on later ACKs.
    }
    if (!this.isActive(generation)) return;
  }

  private async handleSendFailure(batchId: string, error: unknown, generation: number): Promise<void> {
    const status = statusOf(error);
    if (status === 401 || status === 403) {
      this.stop();
      await this.options.onAuthenticationFailure?.(asError(error));
      return;
    }
    if (status === 400 || status === 409 || status === 422) {
      await this.options.outbox.failBatch(batchId, {
        kind: "permanent",
        status,
        message: asError(error).message,
      });
      return;
    }
    await this.options.outbox.failBatch(batchId, {
      kind: "transient",
      status,
      message: asError(error).message,
    });
    if (!this.isActive(generation)) return;
    this.retryAttempt += 1;
    const uncapped = 1_000 * 2 ** (this.retryAttempt - 1);
    const capped = Math.min(uncapped, MAX_RETRY_DELAY_MS);
    const jitter = 0.5 + this.random();
    this.nextEligibleAtMs = this.now() + Math.round(capped * jitter);
  }

  private isOnline(): boolean {
    return (this.options.isOnline ?? defaultOnlineState)();
  }

  private now(): number {
    return (this.options.now ?? Date.now)();
  }

  private random(): number {
    return (this.options.random ?? Math.random)();
  }

  private requestTimeoutMs(): number {
    const configured = this.options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    return Number.isSafeInteger(configured) && configured > 0
      ? configured
      : DEFAULT_REQUEST_TIMEOUT_MS;
  }

  private isActive(generation: number): boolean {
    return this.running && this.generation === generation;
  }
}
