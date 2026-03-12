import { describe, it, expect, vi, afterEach } from "vitest";
import {
  clearPrecheckScreenShareHandoff,
  clearRuntimeScreenShareHandoff,
  consumeRuntimeScreenShareHandoff,
  setRuntimeScreenShareHandoff,
} from "./screenShareHandoffStore";

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
  clearPrecheckScreenShareHandoff(true);
  clearRuntimeScreenShareHandoff(true);
});

describe("screenShareHandoffStore runtime", () => {
  it("preserves stream without stopping tracks when consumed", () => {
    const stream = createMockStream();
    setRuntimeScreenShareHandoff(stream as unknown as MediaStream);

    const consumed = consumeRuntimeScreenShareHandoff();
    expect(consumed).toBe(stream);
    expect(stream.track.stop).not.toHaveBeenCalled();
  });

  it("stops tracks when runtime handoff is cleared", () => {
    const stream = createMockStream();
    setRuntimeScreenShareHandoff(stream as unknown as MediaStream);

    clearRuntimeScreenShareHandoff(true);
    expect(stream.track.stop).toHaveBeenCalledTimes(1);
    expect(consumeRuntimeScreenShareHandoff()).toBeNull();
  });
});
