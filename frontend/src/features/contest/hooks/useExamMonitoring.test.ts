import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useExamMonitoring } from "./useExamMonitoring";

describe("useExamMonitoring", () => {
  it("records browser detector observations through the generic emitter", async () => {
    const onBlockedAction = vi.fn();
    const emitter = { emit: vi.fn().mockResolvedValue(undefined) };
    renderHook(() => useExamMonitoring({ enabled: true, emitter, onBlockedAction }));
    act(() => document.dispatchEvent(new Event("paste", { bubbles: true, cancelable: true })));
    await waitFor(() => expect(emitter.emit).toHaveBeenCalled());
    expect(onBlockedAction).not.toHaveBeenCalled();
    act(() => document.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })));
    expect(onBlockedAction).toHaveBeenCalledOnce();
  });
});
