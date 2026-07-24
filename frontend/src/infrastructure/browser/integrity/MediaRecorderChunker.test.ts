import { describe, expect, it, vi } from "vitest";

import { MediaRecorderChunker } from "./MediaRecorderChunker";

describe("MediaRecorderChunker", () => {
  it("keeps sources separate while sharing an epoch and hash-chains chunks", async () => {
    const putChunk = vi.fn(async (input) => ({ ...input, sha256: `hash-${input.chunkSeq}` }));
    const stream = {} as MediaStream;
    const screen = new MediaRecorderChunker({
      source: "screen_share", stream, epochId: "epoch", store: { putChunk },
      target: { width: 1280, height: 720, fps: 5, bitrate: 800_000 },
      recorderFactory: () => ({ mimeType: "video/webm", state: "inactive", addEventListener: vi.fn(), start: vi.fn(), stop: vi.fn() }),
    });
    const webcam = new MediaRecorderChunker({
      source: "webcam", stream, epochId: "epoch", store: { putChunk },
      target: { width: 640, height: 480, fps: 10, bitrate: 350_000 },
      recorderFactory: () => ({ mimeType: "video/webm", state: "inactive", addEventListener: vi.fn(), start: vi.fn(), stop: vi.fn() }),
    });

    expect(screen.recordingSessionId).not.toBe(webcam.recordingSessionId);
    expect(screen.epochId).toBe(webcam.epochId);
  });
});
