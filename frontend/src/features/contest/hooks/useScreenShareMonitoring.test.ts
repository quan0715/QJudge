import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useScreenShareMonitoring } from "./useScreenShareMonitoring";

describe("useScreenShareMonitoring", () => {
  it("keeps re-share UI state separate from Worker authority", () => {
    const emitter = { emit: vi.fn().mockResolvedValue(undefined) };
    const { result } = renderHook(() => useScreenShareMonitoring({
      enabled: true,
      examSubmitted: false,
      monitoringDisabled: false,
      moduleRole: "primary",
      emitter,
    }));
    act(() => result.current.onStreamLost());
    expect(result.current.reauth.inProgress).toBe(true);
    expect(result.current.reauth.remainingSeconds).toBeNull();
    act(() => result.current.onStreamRestored());
    expect(emitter.emit).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "screen_share_restored",
    }));
  });
});
