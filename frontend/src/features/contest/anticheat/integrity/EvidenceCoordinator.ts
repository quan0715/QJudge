import type {
  EvidenceRetainCommand,
  ExamIntegrityEvidenceDescriptor,
  IntegrityEvidenceSource,
} from "@/core/entities/examIntegrity.entity";
import type { ExamIntegrityRepository } from "@/infrastructure/api/repositories/examIntegrity.repository";
import {
  toEvidenceDescriptor,
  type OpfsEvidenceStore,
  type StoredEvidenceDescriptor,
} from "@/infrastructure/browser/integrity/OpfsEvidenceStore";

export interface EvidenceCoordinatorOptions {
  contestId: string;
  runId: string;
  store: Pick<OpfsEvidenceStore,
    "listDescriptors" | "getBlob" | "protect" | "releaseProtection" | "markRequested" |
    "markVerified" | "markUnavailable" | "deleteDescriptor" | "pendingDescriptorSummaries" |
    "markReported" | "reconcile">;
  repository: Pick<ExamIntegrityRepository,
    "requestEvidenceUploads" | "completeEvidenceUpload" | "reportEvidenceUnavailable">;
  fetchFn?: typeof fetch;
  now?: () => number;
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

/**
 * Feature orchestration for incident-only evidence. It has no detector or
 * policy authority: Worker-projected retain windows are the sole upload trigger.
 */
export class EvidenceCoordinator {
  private readonly inFlight = new Map<string, Promise<void>>();
  private releaseBeforeMs = 0;

  constructor(private readonly options: EvidenceCoordinatorOptions) {}

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
    const work = this.retainOnce(command).finally(() => this.inFlight.delete(command.commandId));
    this.inFlight.set(command.commandId, work);
    return work;
  }

  async releaseBefore(releaseBeforeMs: number): Promise<void> {
    this.releaseBeforeMs = Math.max(this.releaseBeforeMs, releaseBeforeMs);
    const descriptors = await this.options.store.listDescriptors();
    for (const descriptor of descriptors) {
      const retained = descriptor.retainCommandIds.length > 0;
      const uploadTerminal = descriptor.uploadStatus === "local" ||
        descriptor.uploadStatus === "verified" || descriptor.uploadStatus === "unavailable";
      if (
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
    await Promise.allSettled([...this.inFlight.values()]);
  }

  /**
   * Returns false only when the bounded local buffer cannot be recovered
   * without deleting protected, unacknowledged, or not-yet-released evidence.
   */
  async enforceCapacity(source: IntegrityEvidenceSource, policy: EvidenceBufferPolicy): Promise<boolean> {
    const descriptors = (await this.options.store.listDescriptors())
      .filter((item) => item.source === source && item.localAvailability === "available")
      .sort((left, right) => left.endAtMs - right.endAtMs || left.chunkSeq - right.chunkSeq);
    const newestEndAtMs = descriptors.at(-1)?.endAtMs ?? 0;
    const minimumCutoffMs = newestEndAtMs - policy.minimumLocalBufferMs;
    let byteSize = descriptors.reduce((total, descriptor) => total + descriptor.byteSize, 0);
    let oldestStartAtMs = descriptors[0]?.startAtMs ?? newestEndAtMs;
    for (const descriptor of descriptors) {
      const duration = newestEndAtMs - oldestStartAtMs;
      if (byteSize <= policy.localCapBytesPerSource && duration <= policy.localCapMs) break;
      const uploadTerminal = descriptor.uploadStatus === "local" ||
        descriptor.uploadStatus === "verified" || descriptor.uploadStatus === "unavailable";
      if (
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
      oldestStartAtMs = descriptor.endAtMs;
    }
    const remaining = (await this.options.store.listDescriptors())
      .filter((item) => item.source === source && item.localAvailability === "available")
      .sort((left, right) => left.startAtMs - right.startAtMs);
    const remainingBytes = remaining.reduce((total, descriptor) => total + descriptor.byteSize, 0);
    const remainingDuration = (remaining.at(-1)?.endAtMs ?? 0) - (remaining[0]?.startAtMs ?? 0);
    return remainingBytes <= policy.localCapBytesPerSource && remainingDuration <= policy.localCapMs;
  }

  private async retainOnce(command: EvidenceRetainCommand): Promise<void> {
    const all = await this.options.store.listDescriptors();
    const selectedBySource = new Map<IntegrityEvidenceSource, StoredEvidenceDescriptor[]>();
    for (const source of command.sources) {
      const overlapping = all.filter((descriptor) =>
        descriptor.source === source &&
        descriptor.localAvailability === "available" &&
        intersects(descriptor, command.startAtMs, command.endAtMs),
      );
      if (overlapping.length === 0) {
        await this.reportSourceUnavailable(command, source, "source_unavailable");
        continue;
      }
      const withInit = new Map(overlapping.map((descriptor) => [descriptor.localDescriptorId, descriptor]));
      for (const descriptor of overlapping) {
        const init = all.find((candidate) =>
          candidate.source === source &&
          candidate.recordingSessionId === descriptor.recordingSessionId &&
          candidate.isInitChunk &&
          candidate.localAvailability === "available",
        );
        if (init) withInit.set(init.localDescriptorId, init);
      }
      selectedBySource.set(source, [...withInit.values()].sort(
        (left, right) => left.startAtMs - right.startAtMs || left.chunkSeq - right.chunkSeq,
      ));
    }

    const selected = [...selectedBySource.values()].flat();
    if (selected.length === 0) return;
    await this.options.store.protect(command.commandId, selected);
    let commandCompleted = false;
    try {
      const response = await this.options.repository.requestEvidenceUploads(this.options.contestId, {
        runId: this.options.runId,
        incidentId: command.incidentId,
        chunks: selected.map(toEvidenceDescriptor),
      });
      const uploadByIdentity = new Map<string, StoredEvidenceDescriptor>();
      for (const descriptor of selected) {
        uploadByIdentity.set(`${descriptor.source}:${descriptor.chunkSeq}`, descriptor);
      }
      const verified: string[] = [];
      const handledDescriptorIds = new Set<string>();
      for (const upload of response.uploads) {
        const descriptor = selected.find((candidate) =>
          upload.objectKey.endsWith(`/${candidate.recordingSessionId}/${candidate.chunkSeq}.webm`),
        ) ?? uploadByIdentity.get(`${upload.source}:${upload.chunkSeq}`);
        if (!descriptor) continue;
        handledDescriptorIds.add(descriptor.localDescriptorId);
        if (upload.status === "verified") {
          verified.push(descriptor.localDescriptorId);
          continue;
        }
        if (upload.status === "unavailable" || !upload.putUrl) {
          await this.options.repository.reportEvidenceUnavailable(this.options.contestId, {
            chunkId: upload.chunkId,
            reason: "upload_unavailable",
          });
          await this.options.store.markUnavailable([descriptor.localDescriptorId]);
          continue;
        }
        const blob = await this.options.store.getBlob(descriptor);
        if (!blob) {
          await this.options.repository.reportEvidenceUnavailable(this.options.contestId, {
            chunkId: upload.chunkId,
            reason: "local_chunk_missing",
          });
          await this.options.store.markUnavailable([descriptor.localDescriptorId]);
          continue;
        }
        await this.options.store.markRequested([descriptor.localDescriptorId]);
        const response = await (this.options.fetchFn ?? fetch)(upload.putUrl, {
          method: "PUT",
          headers: upload.requiredHeaders,
          body: blob,
        });
        if (!response.ok) throw new Error(`Evidence upload failed with ${response.status}`);
        await this.options.repository.completeEvidenceUpload(this.options.contestId, upload.chunkId);
        verified.push(descriptor.localDescriptorId);
      }
      await this.options.store.markVerified(verified, (this.options.now ?? Date.now)());
      const requiredDescriptorIds = selected
        .filter((descriptor) => intersects(descriptor, command.startAtMs, command.endAtMs))
        .map((descriptor) => descriptor.localDescriptorId);
      if (requiredDescriptorIds.some((localDescriptorId) => !handledDescriptorIds.has(localDescriptorId))) {
        throw new Error("Evidence manifest omitted an intersecting chunk");
      }
      commandCompleted = true;
    } finally {
      // The Backend repeats an incomplete command. Keep protection through a
      // transient failure so a release watermark can never erase its retry data.
      if (commandCompleted) await this.options.store.releaseProtection(command.commandId);
    }
  }

  private async reportSourceUnavailable(
    command: EvidenceRetainCommand,
    source: IntegrityEvidenceSource,
    reason: string,
  ): Promise<void> {
    const eventId = numericEventId(command.eventId);
    if (eventId === null) {
      throw new Error("Evidence retain command has no Backend event identity");
    }
    await this.options.repository.reportEvidenceUnavailable(this.options.contestId, {
      runId: this.options.runId,
      incidentId: command.incidentId,
      eventId,
      source,
      reason,
    });
  }
}
