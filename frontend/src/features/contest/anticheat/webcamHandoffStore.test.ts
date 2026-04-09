import { describe, it, expect, vi, afterEach } from "vitest";
import {
  clearPrecheckWebcamHandoff,
  clearRuntimeWebcamHandoff,
  consumeRuntimeWebcamHandoff,
  setRuntimeWebcamHandoff,
  setPrecheckWebcamHandoff,
  consumePrecheckWebcamHandoff,
} from "./webcamHandoffStore";

type MockTrack = {
  stop: ReturnType<typeof vi.fn>;
};

const createMockStream = () => {
  const track: MockTrack = { stop: vi.fn() };
  return {
    getTracks: () => [track],
    track,
  };
};

afterEach(() => {
  clearPrecheckWebcamHandoff(true);
  clearRuntimeWebcamHandoff(true);
});

describe("webcamHandoffStore runtime", () => {
  it("preserves stream without stopping tracks when consumed", () => {
    const stream = createMockStream();
    setRuntimeWebcamHandoff(stream as unknown as MediaStream);

    const consumed = consumeRuntimeWebcamHandoff();
    expect(consumed).toBe(stream);
    expect(stream.track.stop).not.toHaveBeenCalled();
  });

  it("stops tracks when runtime handoff is cleared", () => {
    const stream = createMockStream();
    setRuntimeWebcamHandoff(stream as unknown as MediaStream);

    clearRuntimeWebcamHandoff(true);
    expect(stream.track.stop).toHaveBeenCalledTimes(1);
    expect(consumeRuntimeWebcamHandoff()).toBeNull();
  });

  it("does not stop tracks when cleared with stopTracks=false", () => {
    const stream = createMockStream();
    setRuntimeWebcamHandoff(stream as unknown as MediaStream);

    clearRuntimeWebcamHandoff(false);
    expect(stream.track.stop).not.toHaveBeenCalled();
  });

  it("returns null when no handoff is set", () => {
    expect(consumeRuntimeWebcamHandoff()).toBeNull();
  });
});

describe("webcamHandoffStore precheck", () => {
  it("set and consume precheck handoff", () => {
    const stream = createMockStream();
    setPrecheckWebcamHandoff(stream as unknown as MediaStream);

    const consumed = consumePrecheckWebcamHandoff();
    expect(consumed).toBe(stream);
    expect(stream.track.stop).not.toHaveBeenCalled();
  });

  it("stops tracks when precheck handoff is cleared", () => {
    const stream = createMockStream();
    setPrecheckWebcamHandoff(stream as unknown as MediaStream);

    clearPrecheckWebcamHandoff(true);
    expect(stream.track.stop).toHaveBeenCalledTimes(1);
    expect(consumePrecheckWebcamHandoff()).toBeNull();
  });
});
