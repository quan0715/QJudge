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
  private readonly onlineHandler = () => this.requestTick();
  private readonly pageHideHandler = () => this.requestTick();

  constructor(options: IntegrityTransportOptions) {
    this.options = options;
    this.eventTarget = options.eventTarget;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.eventTarget?.addEventListener("online", this.onlineHandler);
    this.eventTarget?.addEventListener("pagehide", this.pageHideHandler);
    this.requestTick();
    this.intervalId = setInterval(() => this.requestTick(), TRANSPORT_INTERVAL_MS);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
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
    try {
      const snapshot = this.options.snapshotProvider();
      await this.options.outbox.append({
        eventType: "state_snapshot",
        clientOccurredAtMs: this.now(),
        payload: snapshot,
      });
      if (!this.isOnline() || this.now() < this.nextEligibleAtMs) return;

      const batch = await this.options.outbox.claimBatch({
        maxRecords: MAX_BATCH_RECORDS,
        maxBytes: MAX_BATCH_BYTES,
      });
      if (!batch) return;

      try {
        const ack = await this.options.repository.sendBatch(this.options.contestId, batch);
        await this.options.outbox.ackThrough(batch.runId, batch.deviceId, ack.ackedThroughSeq);
        this.retryAttempt = 0;
        this.nextEligibleAtMs = 0;
        await this.applyAckCallbacks(ack);
      } catch (error) {
        await this.handleSendFailure(batch.batchId, error);
      }
    } finally {
      this.tickInFlight = false;
    }
  }

  private async applyAckCallbacks(ack: ExamIntegrityBatchAck): Promise<void> {
    for (const command of ack.pendingCommands) {
      try {
        await this.options.onPendingCommand?.(command);
      } catch {
        // Pending evidence commands are repeated by the Backend until complete.
      }
    }
    try {
      await this.options.onReleaseEvidenceBeforeMs?.(ack.releaseEvidenceBeforeMs);
    } catch {
      // The local evidence coordinator retries release work on later ACKs.
    }
  }

  private async handleSendFailure(batchId: string, error: unknown): Promise<void> {
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
}
