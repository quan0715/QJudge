import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useCopyText } from "./useCopyText";

describe("useCopyText", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should initialize with isCopied=false", () => {
    const { result } = renderHook(() => useCopyText());

    expect(result.current.isCopied).toBe(false);
  });

  it("should set isCopied=true after successful copy", async () => {
    vi.mocked(navigator.clipboard.writeText).mockResolvedValue(undefined);

    const { result } = renderHook(() => useCopyText());

    await act(async () => {
      await result.current.copy("test text");
    });

    expect(result.current.isCopied).toBe(true);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("test text");
  });

  it("should reset isCopied=false after timeout (default 2000ms)", async () => {
    vi.mocked(navigator.clipboard.writeText).mockResolvedValue(undefined);

    const { result } = renderHook(() => useCopyText());

    await act(async () => {
      await result.current.copy("test text");
    });

    expect(result.current.isCopied).toBe(true);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.isCopied).toBe(false);
  });

  it("should use custom timeout", async () => {
    vi.mocked(navigator.clipboard.writeText).mockResolvedValue(undefined);

    const { result } = renderHook(() => useCopyText(1000));

    await act(async () => {
      await result.current.copy("test text");
    });

    expect(result.current.isCopied).toBe(true);

    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(result.current.isCopied).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.isCopied).toBe(false);
  });

  it("should not copy empty text", async () => {
    const { result } = renderHook(() => useCopyText());

    await act(async () => {
      await result.current.copy("");
    });

    expect(result.current.isCopied).toBe(false);
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });

  it("should set isCopied=false when copy fails", async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValue(
      new Error("Copy failed")
    );
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { result } = renderHook(() => useCopyText());

    await act(async () => {
      await result.current.copy("test text");
    });

    expect(result.current.isCopied).toBe(false);
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});
