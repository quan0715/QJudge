import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFullscreenMonitoring } from "./useFullscreenMonitoring";

const fullscreen = vi.fn();
vi.mock("@/infrastructure/browser/fullscreen", () => ({
  isFullscreen: () => fullscreen(),
}));

describe("useFullscreenMonitoring", () => {
  it("emits the browser observation at the settled callback time", () => {
    vi.useFakeTimers();
    fullscreen.mockReturnValue(false);
    const emitter = { emit: vi.fn().mockResolvedValue(undefined) };
    const { result } = renderHook(() => useFullscreenMonitoring({
      enabled: true,
      examSubmitted: false,
      emitter,
    }));
    act(() => document.dispatchEvent(new Event("fullscreenchange")));
    act(() => vi.advanceTimersByTime(100));
    expect(result.current.interrupted).toBe(true);
    expect(emitter.emit).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "exit_fullscreen_triggered",
    }));
    vi.useRealTimers();
  });
});
