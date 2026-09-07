import type {
  ExamIntegrityEvidenceDescriptor,
  IntegrityEvidenceSource,
} from "@/core/entities/examIntegrity.entity";

const DATABASE_NAME = "qjudge-exam-integrity-v1";
const DATABASE_VERSION = 3;
const RECORDS_STORE = "records";
const META_STORE = "meta";
const EVIDENCE_DESCRIPTORS_STORE = "evidenceDescriptors";
const EVIDENCE_BLOBS_STORE = "evidenceBlobs";

export type EvidenceLocalAvailability = "available" | "missing" | "evicted" | "unavailable";
export type EvidenceUploadStatus = "local" | "requested" | "verified" | "unavailable";

export interface StoredEvidenceDescriptor extends ExamIntegrityEvidenceDescriptor {
  participantId?: number;
  attemptId?: string;
  runId: string;
  deviceId: string;
  epochId: string;
  actualWidth: number | null;
  actualHeight: number | null;
  actualFps: number | null;
  actualBitrate: number | null;
  gapBeforeMs: number;
  localAvailability: EvidenceLocalAvailability;
  retainCommandIds: string[];
  uploadStatus: EvidenceUploadStatus;
  verifiedAtMs: number | null;
  batchAcked: boolean;
  createdAtMs: number;
  reportedAtSeq: number | null;
  opfsPath: string;
}

interface StoredEvidenceBlob {
  runId: string;
  deviceId: string;
  localDescriptorId: string;
  bytes: Blob;
}

export interface EvidenceChunkInput {
  source: IntegrityEvidenceSource;
  recordingSessionId: string;
  epochId: string;
  chunkSeq: number;
  isInitChunk: boolean;
  previousSha256: string;
  startAtMs: number;
  endAtMs: number;
  codec: string;
  bytes: Blob;
  actualWidth?: number | null;
  actualHeight?: number | null;
  actualFps?: number | null;
  actualBitrate?: number | null;
  gapBeforeMs?: number;
}

export interface OpfsWritableFile {
  write(data: Blob): Promise<void>;
  flush?: () => Promise<void>;
  close(): Promise<void>;
}

export interface OpfsFileHandle {
  createWritable(): Promise<OpfsWritableFile>;
  getFile(): Promise<Blob>;
}

export interface OpfsDirectory {
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<OpfsDirectory>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<OpfsFileHandle>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
  values?: () => AsyncIterable<unknown>;
}

export interface OpfsEvidenceStoreOptions {
  participantId?: number;
  attemptId?: string;
  runId: string;
  deviceId: string;
  databaseName?: string;
  opfs?: OpfsDirectory | null;
  now?: () => number;
  createId?: () => string;
}

const requestResult = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });

const transactionDone = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });

const ensureStores = (database: IDBDatabase): void => {
  if (!database.objectStoreNames.contains(RECORDS_STORE)) {
    const records = database.createObjectStore(RECORDS_STORE, {
      keyPath: ["runId", "deviceId", "seq"],
    });
    records.createIndex("batchId", "batchId", { unique: false });
    records.createIndex("acked", "acked", { unique: false });
  }
  if (!database.objectStoreNames.contains(META_STORE)) {
    database.createObjectStore(META_STORE, { keyPath: ["runId", "deviceId"] });
  }
  if (!database.objectStoreNames.contains(EVIDENCE_DESCRIPTORS_STORE)) {
    database.createObjectStore(EVIDENCE_DESCRIPTORS_STORE, {
      keyPath: ["runId", "deviceId", "localDescriptorId"],
    });
  }
  if (!database.objectStoreNames.contains(EVIDENCE_BLOBS_STORE)) {
    database.createObjectStore(EVIDENCE_BLOBS_STORE, {
      keyPath: ["runId", "deviceId", "localDescriptorId"],
    });
  }
};

const openDatabase = (name: string): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(name, DATABASE_VERSION);
    request.onupgradeneeded = (event) => {
      ensureStores(request.result);
      if (event.oldVersion > 0 && event.oldVersion < DATABASE_VERSION) {
        for (const storeName of request.result.objectStoreNames) {
          request.transaction?.objectStore(storeName).clear();
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open integrity evidence storage"));
  });

const sha256 = async (bytes: Blob): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", await bytes.arrayBuffer());
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
};

const defaultId = (): string => crypto.randomUUID();

const descriptorKey = (runId: string, deviceId: string, localDescriptorId: string) =>
  [runId, deviceId, localDescriptorId];

const evidenceBlobKey = descriptorKey;

const rootDirectory = async (): Promise<OpfsDirectory> => {
  const storage = (navigator as Navigator & {
    storage?: { getDirectory?: () => Promise<OpfsDirectory> };
  }).storage;
  if (!storage?.getDirectory) throw new Error("OPFS is unavailable for integrity evidence");
  return storage.getDirectory();
};

const nestedDirectory = async (root: OpfsDirectory, pieces: string[]): Promise<OpfsDirectory> => {
  let directory = root;
  for (const piece of pieces) {
    directory = await directory.getDirectoryHandle(piece, { create: true });
  }
  return directory;
};

const evidencePath = (input: Pick<EvidenceChunkInput, "source" | "recordingSessionId" | "chunkSeq">, runId: string, deviceId: string) =>
  `exam-integrity/${runId}/${deviceId}/${input.source}/${input.recordingSessionId}/${input.chunkSeq}.webm`;

const wireDescriptor = (descriptor: StoredEvidenceDescriptor): ExamIntegrityEvidenceDescriptor => ({
  source: descriptor.source,
  recordingSessionId: descriptor.recordingSessionId,
  chunkSeq: descriptor.chunkSeq,
  isInitChunk: descriptor.isInitChunk,
  startAtMs: descriptor.startAtMs,
  endAtMs: descriptor.endAtMs,
  byteSize: descriptor.byteSize,
  codec: descriptor.codec,
  contentType: descriptor.contentType,
  sha256: descriptor.sha256,
  previousSha256: descriptor.previousSha256,
  localDescriptorId: descriptor.localDescriptorId,
});

/**
 * Browser I/O adapter for rolling evidence. Blob bytes live only in OPFS;
 * IndexedDB contains searchable descriptors and durable upload/retention state.
 */
export class OpfsEvidenceStore {
  private readonly captureBlocked = new Set<IntegrityEvidenceSource>();
  private readonly database: IDBDatabase;
  private readonly options: Required<Pick<OpfsEvidenceStoreOptions, "runId" | "deviceId">> &
    Pick<OpfsEvidenceStoreOptions, "now" | "createId" | "participantId" | "attemptId"> & { opfs: OpfsDirectory | null };

  private constructor(
    database: IDBDatabase,
    options: Required<Pick<OpfsEvidenceStoreOptions, "runId" | "deviceId">> &
      Pick<OpfsEvidenceStoreOptions, "now" | "createId" | "participantId" | "attemptId"> & { opfs: OpfsDirectory | null },
  ) {
    this.database = database;
    this.options = options;
  }

  static async open(options: OpfsEvidenceStoreOptions): Promise<OpfsEvidenceStore> {
    if (typeof indexedDB === "undefined") throw new Error("IndexedDB is required for integrity evidence");
    const database = await openDatabase(options.databaseName ?? DATABASE_NAME);
    let opfs: OpfsDirectory | null = options.opfs ?? null;
    if (options.opfs === undefined) {
      try {
        opfs = await rootDirectory();
      } catch {
        // IndexedDB blobs retain the same bounded, incident-only buffer on
        // browsers that do not implement OPFS.
        opfs = null;
      }
    }
    return new OpfsEvidenceStore(database, {
      runId: options.runId,
      deviceId: options.deviceId,
      participantId: options.participantId,
      attemptId: options.attemptId,
      opfs,
      now: options.now ?? Date.now,
      createId: options.createId ?? defaultId,
    });
  }

  async putChunk(input: EvidenceChunkInput): Promise<StoredEvidenceDescriptor> {
    if (input.endAtMs <= input.startAtMs || input.bytes.size < 1) {
      throw new Error("Evidence chunks require non-empty forward time ranges");
    }
    const path = evidencePath(input, this.options.runId, this.options.deviceId);
    const descriptor: StoredEvidenceDescriptor = {
      ...(this.options.attemptId ? { attemptId: this.options.attemptId, participantId: this.options.participantId } : {}),
      runId: this.options.runId,
      deviceId: this.options.deviceId,
      source: input.source,
      recordingSessionId: input.recordingSessionId,
      chunkSeq: input.chunkSeq,
      isInitChunk: input.isInitChunk,
      startAtMs: input.startAtMs,
      endAtMs: input.endAtMs,
      byteSize: input.bytes.size,
      codec: input.codec,
      contentType: "video/webm",
      sha256: await sha256(input.bytes),
      previousSha256: input.previousSha256,
      localDescriptorId: this.options.createId!(),
      epochId: input.epochId,
      actualWidth: input.actualWidth ?? null,
      actualHeight: input.actualHeight ?? null,
      actualFps: input.actualFps ?? null,
      actualBitrate: input.actualBitrate ?? null,
      gapBeforeMs: input.gapBeforeMs ?? 0,
      localAvailability: "available",
      retainCommandIds: [],
      uploadStatus: "local",
      verifiedAtMs: null,
      batchAcked: false,
      createdAtMs: this.options.now!(),
      reportedAtSeq: null,
      opfsPath: path,
    };
    if (this.options.opfs) {
      const directory = await nestedDirectory(this.options.opfs, path.split("/").slice(0, -1));
      const writer = await (await directory.getFileHandle(`${input.chunkSeq}.webm`, { create: true })).createWritable();
      try {
        await writer.write(input.bytes);
        await writer.flush?.();
        await writer.close();
      } catch (error) {
        try { await writer.close(); } catch { /* best effort close after an interrupted write */ }
        throw error;
      }
      const transaction = this.database.transaction(EVIDENCE_DESCRIPTORS_STORE, "readwrite");
      transaction.objectStore(EVIDENCE_DESCRIPTORS_STORE).put(descriptor);
      await transactionDone(transaction);
      return descriptor;
    }
    const transaction = this.database.transaction(
      [EVIDENCE_DESCRIPTORS_STORE, EVIDENCE_BLOBS_STORE],
      "readwrite",
    );
    transaction.objectStore(EVIDENCE_BLOBS_STORE).put({
      runId: descriptor.runId,
      deviceId: descriptor.deviceId,
      localDescriptorId: descriptor.localDescriptorId,
      bytes: input.bytes,
    } satisfies StoredEvidenceBlob);
    transaction.objectStore(EVIDENCE_DESCRIPTORS_STORE).put(descriptor);
    await transactionDone(transaction);
    return descriptor;
  }

  async listDescriptors(): Promise<StoredEvidenceDescriptor[]> {
    return (await this.allDescriptors()).filter(item => this.owns(item));
  }

  /** Preserved prior/unknown owners still consume the same source budget. */
  async retainedOtherAttemptUsage(source: IntegrityEvidenceSource): Promise<{ bytes: number; durationMs: number }> {
    const retained = (await this.allDescriptors()).filter(item => item.source === source && !this.owns(item));
    return { bytes: retained.reduce((sum, item) => sum + item.byteSize, 0),
      durationMs: retained.reduce((sum, item) => sum + Math.max(0, item.endAtMs - item.startAtMs), 0) };
  }

  private async allDescriptors(): Promise<StoredEvidenceDescriptor[]> {
    const transaction = this.database.transaction(EVIDENCE_DESCRIPTORS_STORE, "readonly");
    const all = await requestResult(
      transaction.objectStore(EVIDENCE_DESCRIPTORS_STORE).getAll(),
    ) as StoredEvidenceDescriptor[];
    await transactionDone(transaction);
    return all
      .filter(item => item.runId === this.options.runId && item.deviceId === this.options.deviceId)
      .sort((left, right) => left.createdAtMs - right.createdAtMs || left.chunkSeq - right.chunkSeq);
  }

  get blockedCaptureSources(): readonly IntegrityEvidenceSource[] {
    return [...this.captureBlocked];
  }

  async getBlob(descriptor: StoredEvidenceDescriptor): Promise<Blob | null> {
    if (!this.owns(descriptor)) throw new Error("Evidence ownership mismatch");
    try {
      if (!this.options.opfs) {
        const transaction = this.database.transaction(EVIDENCE_BLOBS_STORE, "readonly");
        const stored = await requestResult(
          transaction.objectStore(EVIDENCE_BLOBS_STORE).get(
            evidenceBlobKey(this.options.runId, this.options.deviceId, descriptor.localDescriptorId),
          ),
        ) as StoredEvidenceBlob | undefined;
        await transactionDone(transaction);
        return stored?.bytes ?? null;
      }
      const pieces = descriptor.opfsPath.split("/");
      const directory = await nestedDirectory(this.options.opfs, pieces.slice(0, -1));
      return await (await directory.getFileHandle(pieces.at(-1)!)).getFile();
    } catch {
      await this.update(descriptor.localDescriptorId, { localAvailability: "missing" });
      return null;
    }
  }

  async markReported(descriptors: ExamIntegrityEvidenceDescriptor[], sequence: number): Promise<void> {
    await this.updateMany(descriptors.map((item) => item.localDescriptorId), (item) => ({
      reportedAtSeq: item.reportedAtSeq ?? sequence,
    }));
  }

  async pendingDescriptorSummaries(): Promise<ExamIntegrityEvidenceDescriptor[]> {
    return (await this.listDescriptors())
      .filter((item) => item.localAvailability === "available" && item.reportedAtSeq === null)
      .map(wireDescriptor);
  }

  async protect(commandId: string, descriptors: StoredEvidenceDescriptor[]): Promise<void> {
    await this.updateMany(descriptors.map((item) => item.localDescriptorId), (item) => ({
      retainCommandIds: item.retainCommandIds.includes(commandId)
        ? item.retainCommandIds
        : [...item.retainCommandIds, commandId],
    }));
  }

  async markRequested(localDescriptorIds: string[]): Promise<void> {
    await this.updateMany(localDescriptorIds, () => ({ uploadStatus: "requested" }));
  }

  async markVerified(localDescriptorIds: string[], atMs = this.options.now!()): Promise<void> {
    await this.updateMany(localDescriptorIds, () => ({ uploadStatus: "verified", verifiedAtMs: atMs }));
  }

  async markUnavailable(localDescriptorIds: string[]): Promise<void> {
    await this.updateMany(localDescriptorIds, () => ({
      uploadStatus: "unavailable",
      localAvailability: "unavailable",
    }));
  }

  async releaseProtection(commandId: string): Promise<void> {
    const descriptors = await this.listDescriptors();
    await this.updateMany(descriptors
      .filter((item) => item.retainCommandIds.includes(commandId))
      .map((item) => item.localDescriptorId), (item) => ({
        retainCommandIds: item.retainCommandIds.filter((value) => value !== commandId),
      }));
  }

  async deleteDescriptor(descriptor: StoredEvidenceDescriptor): Promise<void> {
    if (!this.owns(descriptor)) throw new Error("Evidence ownership mismatch");
    if (this.options.opfs) {
      const pieces = descriptor.opfsPath.split("/");
      try {
        const directory = await nestedDirectory(this.options.opfs, pieces.slice(0, -1));
        await directory.removeEntry(pieces.at(-1)!);
      } catch {
        // A missing local file is equivalent to an evicted file for retention.
      }
    }
    const transaction = this.database.transaction(
      [EVIDENCE_DESCRIPTORS_STORE, EVIDENCE_BLOBS_STORE],
      "readwrite",
    );
    transaction.objectStore(EVIDENCE_DESCRIPTORS_STORE).delete(
      descriptorKey(this.options.runId, this.options.deviceId, descriptor.localDescriptorId),
    );
    transaction.objectStore(EVIDENCE_BLOBS_STORE).delete(
      evidenceBlobKey(this.options.runId, this.options.deviceId, descriptor.localDescriptorId),
    );
    await transactionDone(transaction);
  }

  async reconcile(): Promise<void> {
    const descriptors = await this.listDescriptors();
    for (const descriptor of descriptors) {
      if (descriptor.localAvailability !== "available") continue;
      const blob = await this.getBlob(descriptor);
      if (!blob) await this.update(descriptor.localDescriptorId, { localAvailability: "missing" });
    }
    if (this.options.opfs && !this.options.attemptId) {
      const expectedPaths = new Set(descriptors.map((descriptor) => descriptor.opfsPath.split("/").slice(3).join("/")));
      await this.deleteUnreferencedFiles(expectedPaths);
    } else if (this.options.opfs && this.options.attemptId) {
      // Called before this owner's capture starts. Preserve other attempts and
      // crash-written files; unknown duration must not create a fresh budget.
      const known = new Map((await this.allDescriptors()).map(item => [item.opfsPath, item.byteSize]));
      for (const source of ["screen_share", "webcam"] as const) {
        let foundSource = false;
        try {
          let directory = this.options.opfs;
          const path = ["exam-integrity", this.options.runId, this.options.deviceId, source];
          for (const piece of path) directory = await directory.getDirectoryHandle(piece);
          foundSource = true;
          await this.verifyAccountedFiles(directory, path.join("/"), known, { entries: 0 }, 0);
        } catch (error) {
          if (foundSource || (error as { name?: string }).name !== "NotFoundError") this.captureBlocked.add(source);
        }
      }
    }
  }

  private async verifyAccountedFiles(directory: OpfsDirectory, path: string, known: Map<string, number>, budget: { entries: number }, depth: number): Promise<void> {
    if (!directory.values || depth > 8) throw new Error("Evidence source accounting unavailable");
    for await (const entry of directory.values()) {
      if (++budget.entries > 10000) throw new Error("Evidence source accounting capacity reached");
      const child = entry as { kind?: string; name?: string };
      if (!child.name) throw new Error("Unknown evidence file");
      const childPath = `${path}/${child.name}`;
      if (child.kind === "directory") {
        await this.verifyAccountedFiles(await directory.getDirectoryHandle(child.name), childPath, known, budget, depth + 1);
      } else if (child.kind === "file") {
        if (!known.has(childPath) || (await (await directory.getFileHandle(child.name)).getFile()).size !== known.get(childPath)) {
          throw new Error("Unaccounted evidence bytes preserved");
        }
      } else throw new Error("Unknown evidence entry");
    }
  }

  async close(): Promise<void> {
    this.database.close();
  }

  private owns(descriptor: StoredEvidenceDescriptor): boolean {
    return descriptor.runId === this.options.runId && descriptor.deviceId === this.options.deviceId &&
      (!this.options.attemptId || (descriptor.attemptId === this.options.attemptId && descriptor.participantId === this.options.participantId));
  }

  private async update(
    localDescriptorId: string,
    patch: Partial<StoredEvidenceDescriptor>,
  ): Promise<void> {
    await this.updateMany([localDescriptorId], () => patch);
  }

  private async updateMany(
    localDescriptorIds: string[],
    patch: (item: StoredEvidenceDescriptor) => Partial<StoredEvidenceDescriptor>,
  ): Promise<void> {
    if (localDescriptorIds.length === 0) return;
    const transaction = this.database.transaction(EVIDENCE_DESCRIPTORS_STORE, "readwrite");
    const store = transaction.objectStore(EVIDENCE_DESCRIPTORS_STORE);
    try {
      for (const localDescriptorId of [...new Set(localDescriptorIds)]) {
        const existing = await requestResult(store.get(
          descriptorKey(this.options.runId, this.options.deviceId, localDescriptorId),
        )) as StoredEvidenceDescriptor | undefined;
        if (existing && !this.owns(existing)) throw new Error("Evidence ownership mismatch");
        if (existing) store.put({ ...existing, ...patch(existing) });
      }
      await transactionDone(transaction);
    } catch (error) {
      transaction.abort();
      throw error;
    }
  }

  private async deleteUnreferencedFiles(expectedPaths: Set<string>): Promise<void> {
    let runDirectory: OpfsDirectory;
    try {
      if (!this.options.opfs) return;
      runDirectory = this.options.opfs;
      for (const piece of ["exam-integrity", this.options.runId, this.options.deviceId]) {
        runDirectory = await runDirectory.getDirectoryHandle(piece);
      }
    } catch {
      return;
    }
    await this.deleteUnreferencedFilesInDirectory(runDirectory, "", expectedPaths);
  }

  private async deleteUnreferencedFilesInDirectory(
    directory: OpfsDirectory,
    relativePath: string,
    expectedPaths: Set<string>,
  ): Promise<void> {
    if (!directory.values) return;
    for await (const entry of directory.values()) {
      const candidate = entry as { kind?: string; name?: string };
      if (!candidate.name) continue;
      const childPath = relativePath ? `${relativePath}/${candidate.name}` : candidate.name;
      if (candidate.kind === "directory") {
        try {
          await this.deleteUnreferencedFilesInDirectory(
            await directory.getDirectoryHandle(candidate.name),
            childPath,
            expectedPaths,
          );
        } catch {
          // A concurrently removed directory is already reconciled.
        }
      } else if (candidate.kind === "file" && !expectedPaths.has(childPath)) {
        await directory.removeEntry(candidate.name);
      }
    }
  }
}

export const toEvidenceDescriptor = wireDescriptor;
