import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useWebcamMonitoring } from "./useWebcamMonitoring";

describe("useWebcamMonitoring", () => {
  it("emits stream loss without deciding a submission", () => {
    const emitter = { emit: vi.fn().mockResolvedValue(undefined) };
    const { result } = renderHook(() => useWebcamMonitoring({
      enabled: true,
      examSubmitted: false,
      moduleRole: "secondary",
      streamActive: false,
      emitter,
    }));
    act(() => result.current.onStreamLost());
    expect(result.current.interrupted).toBe(true);
    expect(emitter.emit).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "webcam_interrupted",
    }));
  });
});
