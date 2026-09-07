import type { ContestIntegrityRun } from "@/core/entities/contest.entity";
import type { ExamIntegrityBatchAck, ExamIntegrityStateSnapshot, IntegrityUploadScope } from "@/core/entities/examIntegrity.entity";
import { IndexedDbIntegrityOutbox } from "@/infrastructure/browser/integrity/indexedDbIntegrityOutbox";
import { OpfsEvidenceStore } from "@/infrastructure/browser/integrity/opfsEvidenceStore";
import { MediaRecorderChunker } from "@/infrastructure/browser/integrity/mediaRecorderChunker";
import { examIntegrityRepository } from "@/infrastructure/api/repositories/examIntegrity.repository";
import { IntegrityTransport } from "./integrityTransport";
import { EvidenceCoordinator } from "./evidenceCoordinator";
import type { IntegritySignalEmitter } from "./IntegrityRuntimeContext";
import { applyIntegrityHealthUpdate, initialHealthSnapshot, sourceTargets, evidenceBufferPolicy, enabledEvidenceSources } from "./useIntegrityRuntime";

export type IntegrityUploadMode = "capture" | "drain" | "off";
type Sources = Partial<Record<"screen_share" | "webcam", MediaStream | null>>;
interface SessionOptions {
  contestId: string;
  scope: IntegrityUploadScope;
  nextSequence: number;
  run: ContestIntegrityRun;
  mode?: IntegrityUploadMode;
  snapshotProvider: () => Omit<ExamIntegrityStateSnapshot, "health">;
  onGap: (error: Error) => void;
  onLocalLoss?: (error: Error) => void;
  onProgress: (ack: ExamIntegrityBatchAck) => void;
}

/** A single durable attempt owner. Capture can disappear without releasing its
 * stores. A scope transition creates a different owner and cannot relabel data. */
export class ResidentIntegritySession {
  private mode: IntegrityUploadMode;
  private closed = false;
  private outbox: IndexedDbIntegrityOutbox | null = null;
  private store: OpfsEvidenceStore | null = null;
  private coordinator: EvidenceCoordinator | null = null;
  private captureStorageReady = false;
  private transport: IntegrityTransport | null = null;
  private ready: Promise<void> | null = null;
  private evidenceReady: Promise<void> | null = null;
  private writes: Promise<void> = Promise.resolve();
  private queuedWrites = 0;
  private evidenceFenceDisabled = false;
  private lastCaptureBoundaryMs = 0;
  private transitions: Promise<void> = Promise.resolve();
  private finalSeq: number | undefined;
  private health = initialHealthSnapshot();
  private sources: Sources = {};
  private chunkers = new Map<string, MediaRecorderChunker>();
  private readonly stoppingMedia = new Set<Promise<void>>();
  readonly emitter: IntegritySignalEmitter;
  private readonly options: SessionOptions;

  constructor(options: SessionOptions) {
    this.options = options;
    this.mode = options.mode ?? "capture";
    this.emitter = {
      emit: (signal) => {
        if (this.closed || this.mode !== "capture") return Promise.resolve();
        if (this.queuedWrites >= 128) {
          this.localLoss(new Error("Integrity local write queue at capacity"));
          return Promise.resolve();
        }
        this.queuedWrites += 1;
        const write = this.writes.then(async () => {
          await this.ready;
          if (!this.outbox) throw new Error("Integrity local event storage unavailable");
          await this.outbox.append(signal);
        }).catch((error) => this.localLoss(error)).finally(() => { this.queuedWrites -= 1; });
        this.writes = write;
        return write;
      },
      updateHealth: (update) => { this.health = applyIntegrityHealthUpdate(this.health, update); },
    };
  }

  start(): Promise<void> {
    if (!this.ready) {
      this.ready = this.open();
      this.transitions = this.ready.then(async () => {
        await this.writes;
        if (this.closed) return;
        if (this.mode === "drain") this.finalSeq = await this.outbox?.lastSequence();
        this.startTransport();
      });
    }
    return this.transitions;
  }

  private async open(): Promise<void> {
    try {
      const { scope, run } = this.options;
      this.outbox = await IndexedDbIntegrityOutbox.open({ runId: scope.run_id,
        participantId: scope.participant_id, deviceId: scope.device_id, attemptId: scope.attempt_id,
        nextSequence: this.options.nextSequence, registryVersion: run.registrySnapshot.version, clientBuild: "frontend" });
      if (this.closed) return;
      // Event intake and transport depend only on IndexedDB. Evidence recovery
      // runs independently and cannot hold up detector signals or answer flows.
      this.evidenceReady = this.openEvidence();
    } catch (error) { this.localLoss(error); }
  }

  private async openEvidence(): Promise<void> {
    const { scope } = this.options;
    try {
      this.store = await OpfsEvidenceStore.open({ runId: scope.run_id, deviceId: scope.device_id,
        participantId: scope.participant_id, attemptId: scope.attempt_id });
      if (this.closed) return;
      const coordinator = new EvidenceCoordinator({ contestId: this.options.contestId,
        runId: scope.run_id, store: this.store,
        canRelease: () => {
          if (Date.now() < this.lastCaptureBoundaryMs && !this.evidenceFenceDisabled) {
            this.localLoss(new Error("Evidence clock regressed; release suspended"));
          }
          return !this.evidenceFenceDisabled;
        },
        requestTimeoutMs: 10_000,
        onRetryableFailure: (error) => this.gap(error),
        repository: { submitEvidenceCheckpoint: (id, request, signal) => examIntegrityRepository.submitEvidenceCheckpoint(id, { ...request, uploadScope: scope }, signal) },
      });
      await coordinator.start();
      for (const source of this.store.blockedCaptureSources ?? []) {
        this.localLoss(new Error(`Evidence ${source}: unaccounted local bytes preserved; capture stopped`));
      }
      this.lastCaptureBoundaryMs = (await this.store.listDescriptors()).reduce(
        (latest, item) => Math.max(latest, item.endAtMs), this.lastCaptureBoundaryMs);
      if (this.closed) return;
      this.coordinator = coordinator;
      this.captureStorageReady = true;
    } catch (error) { this.localLoss(error); }

    if (!this.closed) this.syncSources();
  }

  setSources(sources: Sources): void {
    if (sources.screen_share === this.sources.screen_share && sources.webcam === this.sources.webcam) return;
    this.sources = sources;
    this.syncSources();
  }

  private syncSources(): void {
    for (const chunker of this.chunkers.values()) {
      chunker.stop();
      const idle = chunker.whenIdle();
      this.stoppingMedia.add(idle);
      void idle.finally(() => this.stoppingMedia.delete(idle));
    }
    this.chunkers.clear();
    if (this.closed || this.mode !== "capture" || !this.captureStorageReady || !this.store || !this.coordinator) return;
    const targets = sourceTargets(this.options.run.policySnapshot);
    const policy = evidenceBufferPolicy(this.options.run.policySnapshot);
    for (const source of enabledEvidenceSources(this.options.run.policySnapshot)) {
      if (this.store.blockedCaptureSources?.includes(source)) continue;
      const stream = this.sources[source];
      if (!stream) continue;
      const coordinator = this.coordinator;
      const chunker = new MediaRecorderChunker({ source, stream, store: this.store,
        target: targets[source],
        onDegraded: (reason) => { chunker.stop(); this.localLoss(new Error(`Evidence ${source}: ${reason}`)); },
        onStoredChunk: async () => {
          try {
            if (await coordinator.enforceCapacity(source, policy)) return;
          } catch (error) {
            this.localLoss(error);
          }
          chunker.stop();
          this.localLoss(new Error(`Evidence ${source}: capacity_protected_evidence`));
        },
      });
      this.chunkers.set(source, chunker);
      chunker.start();
    }
  }

  setMode(mode: IntegrityUploadMode): Promise<void> {
    if (mode === this.mode) return this.transitions;
    this.mode = mode; // Fence emit and collection synchronously, before awaits.
    this.syncSources();
    this.transport?.stop();
    this.coordinator?.cancelPending();
    const change = async () => {
      await this.ready;
      await this.transport?.whenIdle();
      await this.writes;
      await Promise.all(this.stoppingMedia);
      if (this.closed) return;
      if (this.mode === "drain" && this.finalSeq === undefined) this.finalSeq = await this.outbox?.lastSequence();
      this.startTransport();
    };
    this.transitions = this.transitions.then(change).catch((error) => this.gap(error));
    return this.transitions;
  }

  private startTransport(): void {
    this.transport?.stop();
    if (this.closed || this.mode === "off" || !this.outbox) return;
    const { scope, contestId } = this.options;
    this.transport = new IntegrityTransport({ contestId, outbox: this.outbox, mode: this.mode,
      persistCaptureSnapshot: () => this.persistCaptureSnapshot(),
      repository: { sendBatch: (id, batch, signal) => examIntegrityRepository.sendBatch(id, batch, signal, scope) },
      snapshotProvider: () => ({ ...this.options.snapshotProvider(), health: this.health }),
      evidenceDescriptorsProvider: () => this.coordinator?.pendingDescriptorSummaries() ?? Promise.resolve([]),
      onSnapshotPersisted: (descriptors, sequence) => this.coordinator?.markSnapshotPersisted(descriptors, sequence),
      onPendingCommand: (command) => this.coordinator?.retain(command),
      onReleaseEvidenceBeforeMs: async (watermark) => {
        try {
          await this.coordinator?.releaseBefore(Math.min(watermark,
            Math.max(0, Date.now() - evidenceBufferPolicy(this.options.run.policySnapshot).minimumLocalBufferMs)));
        } catch (error) {
          this.captureStorageReady = false;
          this.localLoss(error);
          this.syncSources();
        }
      },
      onProgress: this.options.onProgress,
      onGap: (error) => this.gap(error),
      onLocalLoss: (error) => this.localLoss(error),
      controlPoll: async (signal) => {
        this.finalSeq ??= await this.outbox!.lastSequence();
        return examIntegrityRepository.pollUpload(contestId, scope, this.finalSeq, signal);
      },
      eventTarget: window,
    });
    this.transport.start();
  }

  private async persistCaptureSnapshot(): Promise<void> {
    const boundaryTime = Date.now();
    if (boundaryTime < this.lastCaptureBoundaryMs) this.localLoss(new Error("Evidence clock regressed; release suspended"));
    this.lastCaptureBoundaryMs = Math.max(this.lastCaptureBoundaryMs, boundaryTime);
    // This wait holds no emitter queue or answer request. Signals admitted
    // while the encoder flushes join the serial queue before the snapshot.
    await Promise.all([
      ...[...this.chunkers.values()].map(chunker => chunker.evidenceBarrier()),
      ...this.stoppingMedia,
    ]);
    if (this.closed || this.mode !== "capture" || !this.outbox) return;
    const snapshot = this.writes.then(async () => {
      const descriptors = await this.coordinator?.pendingDescriptorSummaries() ?? [];
      if (this.closed || this.mode !== "capture" || !this.outbox) return;
      const policy = evidenceBufferPolicy(this.options.run.policySnapshot);
      const lookback = Math.max(policy.minimumLocalBufferMs, ...Object.values(this.options.run.registrySnapshot.definitions)
        .map(definition => Number((definition as { evidence?: { before_ms?: number } }).evidence?.before_ms ?? 0)));
      const record = await this.outbox.append({ eventType: "health_snapshot", clientOccurredAtMs: Date.now(),
        payload: { ...this.options.snapshotProvider(), health: this.health, activeSourceDescriptors: descriptors },
        evidenceDescriptors: descriptors,
        ...(this.captureStorageReady && !this.evidenceFenceDisabled ? { evidenceFenceBeforeMs: Math.max(0, boundaryTime - lookback) } : {}),
      });
      await this.coordinator?.markSnapshotPersisted(descriptors, record.seq);
    }).catch(error => this.localLoss(error));
    this.writes = snapshot;
    await snapshot;
  }

  async flush(): Promise<void> {
    await this.ready;
    await this.transitions;
    await this.writes;
    await this.transport?.whenIdle();
    this.transport?.requestTick();
    await this.transport?.whenIdle();
    await this.coordinator?.flushPendingUploads();
  }

  async close(): Promise<void> {
    this.closed = true;
    this.mode = "off";
    this.syncSources();
    this.transport?.stop();
    await this.ready;
    this.coordinator?.cancelPending();
    await this.transitions;
    await this.writes;
    await this.transport?.whenIdle();
    await this.coordinator?.flushPendingUploads();
    await Promise.all(this.stoppingMedia);
    await this.evidenceReady;
    await this.store?.close();
    await this.outbox?.close();
  }

  private gap(error: unknown): void {
    this.options.onGap(error instanceof Error ? error : new Error("Integrity storage or upload unavailable"));
  }

  private localLoss(error: unknown): void {
    this.evidenceFenceDisabled = true;
    this.options.onLocalLoss?.(error instanceof Error ? error : new Error("Monitoring data could not be saved"));
    this.gap(error);
  }
}
