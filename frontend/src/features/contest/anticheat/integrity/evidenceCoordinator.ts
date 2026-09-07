import type {
  EvidenceUnavailableReport,
  EvidenceRetainCommand,
  ExamIntegrityEvidenceDescriptor,
  IntegrityEvidenceSource,
} from "@/core/entities/examIntegrity.entity";
import type { ExamIntegrityRepository } from "@/infrastructure/api/repositories/examIntegrity.repository";
import {
  toEvidenceDescriptor,
  type OpfsEvidenceStore,
  type StoredEvidenceDescriptor,
} from "@/infrastructure/browser/integrity/opfsEvidenceStore";

export interface EvidenceCoordinatorOptions {
  canRelease?: () => boolean;
  contestId: string;
  runId: string;
  store: Pick<OpfsEvidenceStore,
    "listDescriptors" | "getBlob" | "protect" | "releaseProtection" | "markRequested" |
    "markVerified" | "markUnavailable" | "deleteDescriptor" | "pendingDescriptorSummaries" |
    "markReported" | "reconcile"> & Partial<Pick<OpfsEvidenceStore, "retainedOtherAttemptUsage">>;
  repository: Pick<ExamIntegrityRepository, "submitEvidenceCheckpoint">;
  fetchFn?: typeof fetch;
  now?: () => number;
  /** Resident only: bound each network request; legacy retains its existing behavior. */
  requestTimeoutMs?: number;
  onRetryableFailure?: (error: Error) => void;
}

export interface EvidenceBufferPolicy {
  minimumLocalBufferMs: number;
  localCapMs: number;
  localCapBytesPerSource: number;
}

const intersects = (chunk: StoredEvidenceDescriptor, startAtMs: number, endAtMs: number): boolean =>
  chunk.startAtMs < endAtMs && chunk.endAtMs > startAtMs;

const numericEventId = (eventId: string): number | null => {
  const parsed = Number(eventId);
  return Number.isSafeInteger(parsed) && parsed > 0 && String(parsed) === eventId ? parsed : null;
};

const MAX_COMMANDS_PER_CHECKPOINT = 100;

interface QueuedRetain {
  command: EvidenceRetainCommand;
  promise: Promise<void>;
  resolve: () => void;
  reject: (reason: unknown) => void;
}

/**
 * Feature orchestration for incident-only evidence. It has no detector or
 * policy authority: Worker-projected retain windows are the sole upload trigger.
 */
export class EvidenceCoordinator {
  private readonly inFlight = new Map<string, Promise<void>>();
  private readonly queued = new Map<string, QueuedRetain>();
  private retainDrainScheduled = false;
  private releaseBeforeMs = 0;
  private lifecycle = new AbortController();
  private readonly options: EvidenceCoordinatorOptions;

  constructor(options: EvidenceCoordinatorOptions) {
    this.options = options;
  }

  async start(): Promise<void> {
    await this.options.store.reconcile();
  }

  async pendingDescriptorSummaries(): Promise<ExamIntegrityEvidenceDescriptor[]> {
    return this.options.store.pendingDescriptorSummaries();
  }

  async markSnapshotPersisted(
    descriptors: ExamIntegrityEvidenceDescriptor[],
    sequence: number,
  ): Promise<void> {
    await this.options.store.markReported(descriptors, sequence);
  }

  retain(command: EvidenceRetainCommand): Promise<void> {
    const current = this.inFlight.get(command.commandId);
    if (current) return current;
    const existing = this.queued.get(command.commandId);
    if (existing) return existing.promise;

    let resolve!: () => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<void>((onResolve, onReject) => {
      resolve = onResolve;
      reject = onReject;
    });
    this.queued.set(command.commandId, { command, promise, resolve, reject });
    if (!this.retainDrainScheduled) {
      this.retainDrainScheduled = true;
      queueMicrotask(() => this.drainRetainQueue());
    }
    return promise;
  }

  async releaseBefore(releaseBeforeMs: number): Promise<void> {
    if (this.options.canRelease?.() === false) return;
    this.releaseBeforeMs = Math.max(this.releaseBeforeMs, releaseBeforeMs);
    const descriptors = await this.options.store.listDescriptors();
    for (const descriptor of descriptors) {
      const retained = descriptor.retainCommandIds.length > 0;
      const uploadTerminal = descriptor.uploadStatus === "local" ||
        descriptor.uploadStatus === "verified" || descriptor.uploadStatus === "unavailable";
      if (
        this.options.canRelease?.() !== false &&
        descriptor.endAtMs < releaseBeforeMs &&
        !retained &&
        uploadTerminal &&
        descriptor.batchAcked
      ) {
        await this.options.store.deleteDescriptor(descriptor);
      }
    }
  }

  async flushPendingUploads(): Promise<void> {
    await Promise.allSettled([
      ...new Set(this.inFlight.values()),
      ...[...this.queued.values()].map((entry) => entry.promise),
    ]);
  }

  cancelPending(): void {
    this.lifecycle.abort();
    this.lifecycle = new AbortController();
    for (const entry of this.queued.values()) entry.reject(new Error("Evidence upload stopped"));
    this.queued.clear();
  }

  private async request<T>(send: (signal?: AbortSignal) => Promise<T>, lifecycle: AbortSignal): Promise<T> {
    if (!this.options.requestTimeoutMs) return send();
    lifecycle.throwIfAborted();
    const controller = new AbortController();
    let cancel!: () => void;
    const cancelled = new Promise<never>((_resolve, reject) => {
      cancel = () => { controller.abort(); reject(new Error("Evidence request cancelled or timed out")); };
    });
    lifecycle.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(cancel, this.options.requestTimeoutMs);
    try {
      const result = await Promise.race([send(controller.signal), cancelled]);
      lifecycle.throwIfAborted();
      return result;
    } catch (error) {
      this.options.onRetryableFailure?.(error instanceof Error ? error : new Error("Evidence upload pending"));
      throw error;
    }
    finally { clearTimeout(timer); lifecycle.removeEventListener("abort", cancel); }
  }

  private drainRetainQueue(): void {
    this.retainDrainScheduled = false;
    const entries = [...this.queued.values()];
    this.queued.clear();
    if (entries.length === 0) return;
    const work = this.retainMany(entries.map((entry) => entry.command));
    for (const entry of entries) this.inFlight.set(entry.command.commandId, work);
    void work.then(
      () => entries.forEach((entry) => entry.resolve()),
      (error) => entries.forEach((entry) => entry.reject(error)),
    ).finally(() => {
      for (const entry of entries) this.inFlight.delete(entry.command.commandId);
    });
  }

  /**
   * Returns false only when the bounded local buffer cannot be recovered
   * without deleting protected, unacknowledged, or not-yet-released evidence.
   */
  async enforceCapacity(source: IntegrityEvidenceSource, policy: EvidenceBufferPolicy): Promise<boolean> {
    const other = await this.options.store.retainedOtherAttemptUsage?.(source) ?? { bytes: 0, durationMs: 0 };
    const descriptors = (await this.options.store.listDescriptors())
      .filter((item) => item.source === source && item.localAvailability === "available")
      .sort((left, right) => left.endAtMs - right.endAtMs || left.chunkSeq - right.chunkSeq);
    const newestEndAtMs = descriptors.at(-1)?.endAtMs ?? 0;
    const minimumCutoffMs = newestEndAtMs - policy.minimumLocalBufferMs;
    let byteSize = descriptors.reduce((total, descriptor) => total + descriptor.byteSize, other.bytes);
    let recordedMs = descriptors.reduce(
      (total, descriptor) => total + Math.max(0, descriptor.endAtMs - descriptor.startAtMs),
      other.durationMs,
    );
    for (const descriptor of descriptors) {
      if (byteSize <= policy.localCapBytesPerSource && recordedMs <= policy.localCapMs) break;
      const uploadTerminal = descriptor.uploadStatus === "local" ||
        descriptor.uploadStatus === "verified" || descriptor.uploadStatus === "unavailable";
      if (
        this.options.canRelease?.() === false ||
        descriptor.endAtMs >= minimumCutoffMs ||
        descriptor.endAtMs >= this.releaseBeforeMs ||
        descriptor.retainCommandIds.length > 0 ||
        !descriptor.batchAcked ||
        !uploadTerminal
      ) {
        continue;
      }
      await this.options.store.deleteDescriptor(descriptor);
      byteSize -= descriptor.byteSize;
      recordedMs -= Math.max(0, descriptor.endAtMs - descriptor.startAtMs);
    }
    const remaining = (await this.options.store.listDescriptors())
      .filter((item) => item.source === source && item.localAvailability === "available")
      .sort((left, right) => left.startAtMs - right.startAtMs);
    const remainingBytes = remaining.reduce((total, descriptor) => total + descriptor.byteSize, other.bytes);
    const remainingDuration = remaining.reduce(
      (total, descriptor) => total + Math.max(0, descriptor.endAtMs - descriptor.startAtMs),
      other.durationMs,
    );
    return remainingBytes <= policy.localCapBytesPerSource && remainingDuration <= policy.localCapMs;
  }

  private async retainMany(commands: EvidenceRetainCommand[]): Promise<void> {
    const lifecycle = this.lifecycle.signal;
    for (let index = 0; index < commands.length; index += MAX_COMMANDS_PER_CHECKPOINT) {
      lifecycle.throwIfAborted();
      await this.retainGroup(commands.slice(index, index + MAX_COMMANDS_PER_CHECKPOINT), lifecycle);
    }
  }

  private async retainGroup(commands: EvidenceRetainCommand[], lifecycle: AbortSignal): Promise<void> {
    if (commands.length === 0) return;
    await this.waitForEvidenceWindow(Math.max(...commands.map((command) => command.endAtMs)), lifecycle);
    const all = await this.options.store.listDescriptors();
    const selectedByCommand = new Map<string, StoredEvidenceDescriptor[]>();
    const manifestChunksByIncident = new Map<string, Map<string, StoredEvidenceDescriptor>>();
    const unavailableReports: EvidenceUnavailableReport[] = [];

    for (const command of commands) {
      const selectedForCommand = new Map<string, StoredEvidenceDescriptor>();
      for (const source of command.sources) {
        const overlapping = all.filter((descriptor) =>
          descriptor.source === source &&
          descriptor.localAvailability === "available" &&
          intersects(descriptor, command.startAtMs, command.endAtMs),
        );
        if (overlapping.length === 0) {
          unavailableReports.push(
            this.sourceUnavailableReport(command, source, "local_window_empty"),
          );
          continue;
        }
        for (const descriptor of overlapping) {
          selectedForCommand.set(descriptor.localDescriptorId, descriptor);
          const init = all.find((candidate) =>
            candidate.source === source &&
            candidate.recordingSessionId === descriptor.recordingSessionId &&
            candidate.isInitChunk &&
            candidate.localAvailability === "available",
          );
          if (init) selectedForCommand.set(init.localDescriptorId, init);
        }
      }
      const selected = [...selectedForCommand.values()].sort(
        (left, right) => left.startAtMs - right.startAtMs || left.chunkSeq - right.chunkSeq,
      );
      if (selected.length === 0) continue;
      selectedByCommand.set(command.commandId, selected);
      const incidentChunks = manifestChunksByIncident.get(command.incidentId) ?? new Map();
      for (const descriptor of selected) {
        incidentChunks.set(descriptor.localDescriptorId, descriptor);
      }
      manifestChunksByIncident.set(command.incidentId, incidentChunks);
    }

    if (manifestChunksByIncident.size === 0) {
      if (unavailableReports.length > 0) {
        await this.request((signal) => this.options.repository.submitEvidenceCheckpoint(this.options.contestId, {
          manifests: [],
          completions: [],
          unavailable: unavailableReports,
        }, ...(signal ? [signal] : [])), lifecycle);
      }
      return;
    }

    for (const command of commands) {
      const selected = selectedByCommand.get(command.commandId);
      if (selected) await this.options.store.protect(command.commandId, selected);
    }
    let groupCompleted = false;
    try {
      const manifests = [...manifestChunksByIncident.entries()].map(([incidentId, chunks]) => ({
        runId: this.options.runId,
        incidentId,
        chunks: [...chunks.values()].map(toEvidenceDescriptor),
      }));
      const selected = [...new Map(
        [...manifestChunksByIncident.values()]
          .flatMap((chunks) => [...chunks.values()])
          .map((descriptor) => [descriptor.localDescriptorId, descriptor]),
      ).values()];
      const response = await this.request((signal) => this.options.repository.submitEvidenceCheckpoint(this.options.contestId, {
        manifests,
        completions: [],
        unavailable: unavailableReports,
      }, ...(signal ? [signal] : [])), lifecycle);
      const uploadByIdentity = new Map<string, StoredEvidenceDescriptor>();
      for (const descriptor of selected) {
        uploadByIdentity.set(`${descriptor.source}:${descriptor.chunkSeq}`, descriptor);
      }
      const verified = new Set<string>();
      const completedChunkIds = new Set<string>();
      const unavailableChunkReports: EvidenceUnavailableReport[] = [];
      const locallyUnavailableIds = new Set<string>();
      const handledDescriptorIds = new Set<string>();
      const handledUploadIds = new Set<string>();
      for (const upload of response.uploads) {
        if (handledUploadIds.has(upload.chunkId)) continue;
        handledUploadIds.add(upload.chunkId);
        const descriptor = selected.find((candidate) =>
          upload.objectKey.endsWith(`/${candidate.recordingSessionId}/${candidate.chunkSeq}.webm`),
        ) ?? uploadByIdentity.get(`${upload.source}:${upload.chunkSeq}`);
        if (!descriptor) continue;
        handledDescriptorIds.add(descriptor.localDescriptorId);
        if (upload.status === "verified") {
          verified.add(descriptor.localDescriptorId);
          continue;
        }
        if (upload.status === "unavailable" || !upload.putUrl) {
          unavailableChunkReports.push({
            chunkId: upload.chunkId,
            reason: "upload_unavailable",
          });
          locallyUnavailableIds.add(descriptor.localDescriptorId);
          continue;
        }
        const blob = await this.options.store.getBlob(descriptor);
        if (!blob) {
          unavailableChunkReports.push({
            chunkId: upload.chunkId,
            reason: "local_chunk_missing",
          });
          locallyUnavailableIds.add(descriptor.localDescriptorId);
          continue;
        }
        await this.options.store.markRequested([descriptor.localDescriptorId]);
        const uploadResponse = await this.request((signal) => (this.options.fetchFn ?? fetch)(upload.putUrl!, {
          method: "PUT",
          headers: upload.requiredHeaders,
          body: blob,
          ...(signal ? { signal } : {}),
        }), lifecycle);
        if (!uploadResponse.ok) {
          throw new Error(`Evidence upload failed with ${uploadResponse.status}`);
        }
        completedChunkIds.add(upload.chunkId);
      }
      const requiredDescriptorIds = new Set<string>();
      for (const command of commands) {
        for (const descriptor of selectedByCommand.get(command.commandId) ?? []) {
          if (intersects(descriptor, command.startAtMs, command.endAtMs)) {
            requiredDescriptorIds.add(descriptor.localDescriptorId);
          }
        }
      }
      if ([...requiredDescriptorIds].some((id) => !handledDescriptorIds.has(id))) {
        throw new Error("Evidence manifest omitted an intersecting chunk");
      }

      if (completedChunkIds.size > 0 || unavailableChunkReports.length > 0) {
        const terminalResponse = await this.request((signal) => this.options.repository.submitEvidenceCheckpoint(
          this.options.contestId,
          {
            manifests: [],
            completions: [...completedChunkIds],
            unavailable: unavailableChunkReports,
          },
          ...(signal ? [signal] : []),
        ), lifecycle);
        const verifiedChunkIds = new Set(
          terminalResponse.completions
            .filter((completion) => completion.status === "verified")
            .map((completion) => completion.chunkId),
        );
        for (const upload of response.uploads) {
          if (!verifiedChunkIds.has(upload.chunkId)) continue;
          const descriptor = selected.find((candidate) =>
            upload.objectKey.endsWith(`/${candidate.recordingSessionId}/${candidate.chunkSeq}.webm`),
          ) ?? uploadByIdentity.get(`${upload.source}:${upload.chunkSeq}`);
          if (descriptor) verified.add(descriptor.localDescriptorId);
        }
        if ([...completedChunkIds].some((chunkId) => !verifiedChunkIds.has(chunkId))) {
          throw new Error("Evidence checkpoint did not verify every completed upload");
        }
        if (locallyUnavailableIds.size > 0) {
          await this.options.store.markUnavailable([...locallyUnavailableIds]);
        }
      }

      if (verified.size > 0) {
        await this.options.store.markVerified([...verified], (this.options.now ?? Date.now)());
      }
      groupCompleted = true;
    } finally {
      // The Backend repeats an incomplete command. Keep protection through a
      // transient failure so a release watermark can never erase its retry data.
      if (groupCompleted) {
        for (const command of commands) {
          if (selectedByCommand.has(command.commandId)) {
            await this.options.store.releaseProtection(command.commandId);
          }
        }
      }
    }
  }

  private sourceUnavailableReport(
    command: EvidenceRetainCommand,
    source: IntegrityEvidenceSource,
    reason: string,
  ): EvidenceUnavailableReport {
    const eventId = numericEventId(command.eventId);
    if (eventId === null) {
      throw new Error("Evidence retain command has no Backend event identity");
    }
    return {
      runId: this.options.runId,
      incidentId: command.incidentId,
      eventId,
      source,
      reason,
    };
  }

  private async waitForEvidenceWindow(endAtMs: number, lifecycle: AbortSignal): Promise<void> {
    const delayMs = endAtMs - (this.options.now ?? Date.now)();
    if (delayMs <= 0) return;
    lifecycle.throwIfAborted();
    await new Promise<void>((resolve, reject) => {
      const cancel = () => { clearTimeout(timer); reject(new Error("Evidence window wait stopped")); };
      const timer = window.setTimeout(() => { lifecycle.removeEventListener("abort", cancel); resolve(); }, delayMs);
      lifecycle.addEventListener("abort", cancel, { once: true });
    });
  }
}
