import { describe, expect, it, vi } from "vitest";

import { MediaRecorderChunker } from "./mediaRecorderChunker";

describe("MediaRecorderChunker", () => {
  it("waits for the final stored segment after stopping and never restarts recording", async () => {
    let resolveWrite!: (value: unknown) => void;
    const putChunk = vi.fn(() => new Promise((resolve) => { resolveWrite = resolve; }));
    const listeners = new Map<string, (event: Event) => void>();
    const recorder = { mimeType: "video/webm", state: "inactive", addEventListener: (type: string, callback: (event: Event) => void) => listeners.set(type, callback),
      start: vi.fn(() => { recorder.state = "recording"; }), stop: () => {
        recorder.state = "inactive";
        listeners.get("dataavailable")?.({ data: new Blob(["evidence"]) } as Event);
        listeners.get("stop")?.(new Event("stop"));
      } };
    const stream = { active: true, getVideoTracks: () => [{ applyConstraints: async () => {}, addEventListener: () => {}, getSettings: () => ({}) }] } as unknown as MediaStream;
    const chunker = new MediaRecorderChunker({ source: "screen_share", stream,
      store: { putChunk: putChunk as never }, target: { width: 640, height: 480, fps: 5, bitrate: 100000 }, recorderFactory: () => recorder });
    chunker.start();
    await vi.waitFor(() => expect(recorder.start).toHaveBeenCalledOnce());
    chunker.stop();
    let settled = false;
    const idle = chunker.whenIdle().then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    resolveWrite({ sha256: "stored" });
    await idle;
    expect(settled).toBe(true);
    expect(recorder.start).toHaveBeenCalledOnce();
  });
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

  it("flushes the current segment before a capture page is backgrounded", async () => {
    const visibilityTarget = new EventTarget();
    const listeners = new Map<string, (event: Event) => void>();
    const recorder = {
      mimeType: "video/webm",
      state: "inactive",
      addEventListener: vi.fn((type: string, listener: (event: Event) => void) => {
        listeners.set(type, listener);
      }),
      start: vi.fn(function start(this: { state: string }) {
        this.state = "recording";
      }),
      stop: vi.fn(function stop(this: { state: string }) {
        this.state = "inactive";
        listeners.get("dataavailable")?.({ data: new Blob(["evidence"]) } as Event);
        listeners.get("stop")?.(new Event("stop"));
      }),
    };
    const stream = {
      active: true,
      getVideoTracks: () => [{
        applyConstraints: async () => undefined,
        addEventListener: vi.fn(),
        getSettings: () => ({}),
      }],
    } as unknown as MediaStream;
    const putChunk = vi.fn(async (input) => ({ ...input, sha256: "stored" }));
    const chunker = new MediaRecorderChunker({
      source: "screen_share",
      stream,
      store: { putChunk },
      target: { width: 1280, height: 720, fps: 5, bitrate: 800_000 },
      recorderFactory: () => recorder,
      visibilityTarget,
    });

    chunker.start();
    await vi.waitFor(() => expect(recorder.start).toHaveBeenCalledOnce());
    visibilityTarget.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(() => expect(recorder.stop).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(putChunk).toHaveBeenCalledOnce());
  });
});
