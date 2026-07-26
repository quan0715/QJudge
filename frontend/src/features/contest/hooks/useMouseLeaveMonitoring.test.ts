import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMouseLeaveMonitoring } from "./useMouseLeaveMonitoring";

describe("useMouseLeaveMonitoring", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("emits one edge after a stable boundary leave and one restore", () => {
    const emitter = { emit: vi.fn().mockResolvedValue(undefined) };
    const { result } = renderHook(() => useMouseLeaveMonitoring({
      enabled: true,
      examSubmitted: false,
      emitter,
    }));
    act(() => document.documentElement.dispatchEvent(new MouseEvent("mouseleave", { relatedTarget: null })));
    expect(result.current.interrupted).toBe(false);
    act(() => vi.advanceTimersByTime(300));
    expect(result.current.interrupted).toBe(true);
    act(() => document.documentElement.dispatchEvent(new MouseEvent("mouseleave", { relatedTarget: null })));
    act(() => document.documentElement.dispatchEvent(new MouseEvent("mouseenter")));
    act(() => document.documentElement.dispatchEvent(new MouseEvent("mouseenter")));
    expect(result.current.interrupted).toBe(false);
    expect(emitter.emit).toHaveBeenNthCalledWith(1, expect.objectContaining({
      eventType: "mouse_leave_triggered",
    }));
    expect(emitter.emit).toHaveBeenNthCalledWith(2, expect.objectContaining({
      eventType: "mouse_leave_restored",
    }));
    expect(emitter.emit).toHaveBeenCalledTimes(2);
  });

  it("cancels a boundary slip that returns before debounce", () => {
    const emitter = { emit: vi.fn().mockResolvedValue(undefined) };
    const { result } = renderHook(() => useMouseLeaveMonitoring({
      enabled: true,
      examSubmitted: false,
      emitter,
    }));

    act(() => document.documentElement.dispatchEvent(new MouseEvent("mouseleave", { relatedTarget: null })));
    act(() => vi.advanceTimersByTime(299));
    act(() => document.documentElement.dispatchEvent(new MouseEvent("mouseenter")));
    act(() => vi.advanceTimersByTime(1));

    expect(result.current.interrupted).toBe(false);
    expect(emitter.emit).not.toHaveBeenCalled();
  });

  it("does not emit restore without an accepted leave", () => {
    const emitter = { emit: vi.fn().mockResolvedValue(undefined) };
    renderHook(() => useMouseLeaveMonitoring({
      enabled: true,
      examSubmitted: false,
      emitter,
    }));

    act(() => document.documentElement.dispatchEvent(new MouseEvent("mouseenter")));

    expect(emitter.emit).not.toHaveBeenCalled();
  });
});
