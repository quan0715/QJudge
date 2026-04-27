export interface EvidenceBufferFrame {
  id: number;
  createdAt: number;
  blob: Blob;
}

export interface EvidenceRingBuffer {
  add: (blob: Blob, createdAt?: number) => EvidenceBufferFrame;
  getWindow: (startMs: number, endMs: number) => EvidenceBufferFrame[];
  prune: (nowMs?: number) => void;
  clear: () => void;
  size: () => number;
}

interface Options {
  retentionMs?: number;
  maxFrames?: number;
}

export const createEvidenceRingBuffer = ({
  retentionMs = 30_000,
  maxFrames = 90,
}: Options = {}): EvidenceRingBuffer => {
  const frames: EvidenceBufferFrame[] = [];
  let nextId = 1;

  const prune = (nowMs = Date.now()) => {
    const cutoff = nowMs - retentionMs;
    while (frames.length && frames[0].createdAt < cutoff) {
      frames.shift();
    }
    while (frames.length > maxFrames) {
      frames.shift();
    }
  };

  return {
    add: (blob, createdAt = Date.now()) => {
      const frame = { id: nextId++, createdAt, blob };
      frames.push(frame);
      prune(createdAt);
      return frame;
    },
    getWindow: (startMs, endMs) =>
      frames.filter((frame) => frame.createdAt >= startMs && frame.createdAt <= endMs),
    prune,
    clear: () => {
      frames.length = 0;
    },
    size: () => frames.length,
  };
};
