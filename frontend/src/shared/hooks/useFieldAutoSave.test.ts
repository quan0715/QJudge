import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFieldAutoSave, type FieldAutoSaveOptions } from "./useFieldAutoSave";

describe("useFieldAutoSave", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("reports a save flushed by unmount to the callbacks that queued it", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const onSaveSuccess = vi.fn();
    const { result, unmount } = renderHook(() => useFieldAutoSave({ target: "q1", write, debounceMs: 800, onSaveSuccess }));

    act(() => result.current.debouncedSaveField("question", { title: "edited" }));
    unmount();
    await act(async () => { await vi.runAllTimersAsync(); });

    expect(write).toHaveBeenCalledWith("question", { title: "edited" });
    expect(onSaveSuccess).toHaveBeenCalledWith("question", { title: "edited" });
  });

  it("surfaces a failed unmount flush", async () => {
    const onSaveError = vi.fn();
    const { result, unmount } = renderHook(() => useFieldAutoSave({
      target: "q1", write: vi.fn().mockRejectedValue(new Error("offline")), debounceMs: 800, onSaveError,
    }));

    act(() => result.current.debouncedSaveField("question", { title: "edited" }));
    unmount();
    await act(async () => { await vi.runAllTimersAsync(); });

    expect(onSaveError).toHaveBeenCalledWith("question", expect.objectContaining({ message: "offline" }));
  });

  it("does not report a previous target's save to the next target's callbacks", async () => {
    const first = { write: vi.fn().mockResolvedValue(undefined), onSaveSuccess: vi.fn() };
    const second = { write: vi.fn().mockResolvedValue(undefined), onSaveSuccess: vi.fn() };
    const { result, rerender } = renderHook((options: FieldAutoSaveOptions) => useFieldAutoSave(options), {
      initialProps: { target: "q1", debounceMs: 800, ...first },
    });

    act(() => result.current.debouncedSaveField("question", { title: "q1 edit" }));
    rerender({ target: "q2", debounceMs: 800, ...second });
    await act(async () => { await vi.runAllTimersAsync(); });

    expect(first.write).toHaveBeenCalledWith("question", { title: "q1 edit" });
    expect(first.onSaveSuccess).toHaveBeenCalledWith("question", { title: "q1 edit" });
    expect(second.onSaveSuccess).not.toHaveBeenCalled();
  });
});
