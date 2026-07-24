import type { IntegrityEvidenceSource } from "@/core/entities/examIntegrity.entity";
import type { EvidenceChunkInput, OpfsEvidenceStore } from "./OpfsEvidenceStore";

export const EVIDENCE_CHUNK_MS = 5_000;

export interface MediaRecorderLike {
  readonly mimeType: string;
  readonly state: string;
  addEventListener(type: "dataavailable" | "stop" | "error", listener: (event: Event) => void): void;
  start(): void;
  stop(): void;
}

export interface MediaRecorderChunkerOptions {
  source: IntegrityEvidenceSource;
  stream: MediaStream;
  store: Pick<OpfsEvidenceStore, "putChunk">;
  epochId?: string;
  recordingSessionId?: string;
  target: { width: number; height: number; fps: number; bitrate: number };
  segmentDurationMs?: number;
  now?: () => number;
  createId?: () => string;
  recorderFactory?: (stream: MediaStream, options: MediaRecorderOptions) => MediaRecorderLike;
  onStoredChunk?: (input: Awaited<ReturnType<OpfsEvidenceStore["putChunk"]>>) => void | Promise<void>;
  onDegraded?: (reason: "unsupported" | "encoder_failure" | "stream_ended" | "restart_failure") => void | Promise<void>;
}

const defaultRecorderFactory = (stream: MediaStream, options: MediaRecorderOptions): MediaRecorderLike =>
  new MediaRecorder(stream, options);

const supportedMimeType = (): string | null => {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? null;
};

const streamSettings = (stream: MediaStream) => {
  const settings = stream.getVideoTracks()[0]?.getSettings?.() ?? {};
  return {
    width: typeof settings.width === "number" ? settings.width : null,
    height: typeof settings.height === "number" ? settings.height : null,
    fps: typeof settings.frameRate === "number" ? settings.frameRate : null,
  };
};

/**
 * One source owns one monotonically chained recording session. A new native
 * MediaRecorder is created for every segment so each saved Blob is independently
 * decodable, while the session/sequence/hash lineage remains stable.
 */
export class MediaRecorderChunker {
  readonly source: IntegrityEvidenceSource;
  readonly epochId: string;
  readonly recordingSessionId: string;
  private readonly options: MediaRecorderChunkerOptions;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private recorder: MediaRecorderLike | null = null;
  private started = false;
  private stopping = false;
  private nextSeq = 0;
  private previousSha256 = "";
  private segmentStartedAtMs = 0;
  private lastEndedAtMs: number | null = null;
  private data: Blob[] = [];

  constructor(options: MediaRecorderChunkerOptions) {
    this.options = options;
    this.source = options.source;
    this.epochId = options.epochId ?? (options.createId ?? crypto.randomUUID)();
    this.recordingSessionId = options.recordingSessionId ?? (options.createId ?? crypto.randomUUID)();
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    void this.startConfiguredRecorder();
  }

  private async startConfiguredRecorder(): Promise<void> {
    if (!this.options.stream.active || !this.options.stream.getVideoTracks()[0]) {
      this.started = false;
      void this.degraded("stream_ended");
      return;
    }
    if (!supportedMimeType() && !this.options.recorderFactory) {
      this.started = false;
      void this.degraded("unsupported");
      return;
    }
    try {
      const track = this.options.stream.getVideoTracks()[0];
      try {
        await track.applyConstraints({
          width: { ideal: this.options.target.width },
          height: { ideal: this.options.target.height },
          frameRate: { ideal: this.options.target.fps },
        });
      } catch {
        // Device/browser negotiation may reject ideals. Record the measured
        // settings below instead of abandoning a policy-enabled source.
      }
      if (!this.started) return;
      this.startRecorder();
      this.intervalId = setInterval(() => this.rotate(), this.segmentDurationMs);
      track.addEventListener("ended", () => {
        void this.degraded("stream_ended");
        this.stop();
      }, { once: true });
    } catch {
      this.started = false;
      void this.degraded("restart_failure");
    }
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.stopping = true;
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    const recorder = this.recorder;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }

  private get segmentDurationMs(): number {
    return this.options.segmentDurationMs ?? EVIDENCE_CHUNK_MS;
  }

  private rotate(): void {
    const recorder = this.recorder;
    if (!this.started || !recorder || recorder.state === "inactive") return;
    recorder.stop();
  }

  private startRecorder(): void {
    const mimeType = supportedMimeType() ?? "video/webm";
    const recorder = (this.options.recorderFactory ?? defaultRecorderFactory)(this.options.stream, {
      mimeType,
      videoBitsPerSecond: this.options.target.bitrate,
    });
    this.data = [];
    this.segmentStartedAtMs = this.now();
    recorder.addEventListener("dataavailable", (event) => {
      const blob = (event as Event & { data?: Blob }).data;
      if (blob?.size) this.data.push(blob);
    });
    recorder.addEventListener("error", () => {
      void this.degraded("encoder_failure");
    });
    recorder.addEventListener("stop", () => {
      void this.finishSegment(recorder);
    });
    this.recorder = recorder;
    recorder.start();
  }

  private async finishSegment(recorder: MediaRecorderLike): Promise<void> {
    const endAtMs = this.now();
    const bytes = new Blob(this.data, { type: recorder.mimeType || "video/webm" });
    if (bytes.size > 0) {
      const settings = streamSettings(this.options.stream);
      try {
        const descriptor = await this.options.store.putChunk({
          source: this.source,
          recordingSessionId: this.recordingSessionId,
          epochId: this.epochId,
          chunkSeq: this.nextSeq,
          isInitChunk: this.nextSeq === 0,
          previousSha256: this.previousSha256,
          startAtMs: this.segmentStartedAtMs,
          endAtMs: Math.max(endAtMs, this.segmentStartedAtMs + 1),
          codec: recorder.mimeType || "video/webm",
          bytes,
          actualWidth: settings.width,
          actualHeight: settings.height,
          actualFps: settings.fps,
          actualBitrate: this.options.target.bitrate,
          gapBeforeMs: this.lastEndedAtMs === null ? 0 : Math.max(0, this.segmentStartedAtMs - this.lastEndedAtMs),
        } as EvidenceChunkInput);
        this.previousSha256 = descriptor.sha256;
        this.nextSeq += 1;
        this.lastEndedAtMs = endAtMs;
        await this.options.onStoredChunk?.(descriptor);
      } catch {
        await this.degraded("encoder_failure");
      }
    }
    if (!this.started || this.stopping) {
      this.stopping = false;
      return;
    }
    try {
      this.startRecorder();
    } catch {
      this.started = false;
      await this.degraded("restart_failure");
    }
  }

  private now(): number {
    return (this.options.now ?? Date.now)();
  }

  private async degraded(reason: Parameters<NonNullable<MediaRecorderChunkerOptions["onDegraded"]>>[0]): Promise<void> {
    await this.options.onDegraded?.(reason);
  }
}
