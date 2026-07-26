import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useExamMonitoring } from "./useExamMonitoring";

describe("useExamMonitoring", () => {
  it("records browser detector observations through the generic emitter", async () => {
    const emitter = { emit: vi.fn().mockResolvedValue(undefined) };
    renderHook(() => useExamMonitoring({ enabled: true, emitter }));
    act(() => document.dispatchEvent(new Event("paste", { bubbles: true, cancelable: true })));
    await waitFor(() => expect(emitter.emit).toHaveBeenCalled());
  });
});
