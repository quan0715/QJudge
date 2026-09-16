import { describe, expect, it, vi } from "vitest";

import { cloneVideoTrack } from "./ownedVideoTrack";

function videoTrack() {
  const clone = { kind: "video", readyState: "live", id: "clone", stop: vi.fn() } as unknown as MediaStreamTrack;
  const original = {
    kind: "video",
    readyState: "live",
    id: "original",
    clone: vi.fn(() => clone),
    stop: vi.fn(),
  } as unknown as MediaStreamTrack;
  return { original, clone };
}

describe("cloneVideoTrack", () => {
  it("returns a video clone and never stops the capture track", () => {
    const { original, clone } = videoTrack();

    const owned = cloneVideoTrack(original);

    expect(original.clone).toHaveBeenCalledOnce();
    expect(owned).toBe(clone);
    expect(owned).not.toBe(original);

    owned.stop();

    expect(clone.stop).toHaveBeenCalledOnce();
    expect(original.stop).not.toHaveBeenCalled();
  });

  it("rejects audio tracks before creating a publisher-owned clone", () => {
    const audio = {
      kind: "audio",
      clone: vi.fn(),
    } as unknown as MediaStreamTrack;

    expect(() => cloneVideoTrack(audio)).toThrow("live video source");
    expect(audio.clone).not.toHaveBeenCalled();
  });

  it("rejects ended video tracks before creating a publisher-owned clone", () => {
    const ended = {
      kind: "video",
      readyState: "ended",
      clone: vi.fn(),
    } as unknown as MediaStreamTrack;

    expect(() => cloneVideoTrack(ended)).toThrow("live video source");
    expect(ended.clone).not.toHaveBeenCalled();
  });
});
