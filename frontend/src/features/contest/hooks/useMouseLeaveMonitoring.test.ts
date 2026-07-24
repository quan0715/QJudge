import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useMouseLeaveMonitoring } from "./useMouseLeaveMonitoring";

describe("useMouseLeaveMonitoring", () => {
  it("emits raw leave and restore observations without a local grace timer", () => {
    const emitter = { emit: vi.fn().mockResolvedValue(undefined) };
    const { result } = renderHook(() => useMouseLeaveMonitoring({
      enabled: true,
      examSubmitted: false,
      emitter,
    }));
    act(() => document.documentElement.dispatchEvent(new MouseEvent("mouseleave", { relatedTarget: null })));
    expect(result.current.interrupted).toBe(true);
    act(() => document.documentElement.dispatchEvent(new MouseEvent("mouseenter")));
    expect(result.current.interrupted).toBe(false);
    expect(emitter.emit).toHaveBeenNthCalledWith(1, expect.objectContaining({
      eventType: "mouse_leave_triggered",
    }));
    expect(emitter.emit).toHaveBeenNthCalledWith(2, expect.objectContaining({
      eventType: "mouse_leave_restored",
    }));
  });
});
