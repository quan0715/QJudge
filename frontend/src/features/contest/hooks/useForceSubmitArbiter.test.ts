import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useForceSubmitArbiter } from "./useForceSubmitArbiter";

vi.mock("@/infrastructure/api/repositories", () => ({
  endExam: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/shared/state/examCaptureSessionStore", () => ({
  getExamCaptureSessionId: vi.fn().mockReturnValue(null),
}));

vi.mock("@/features/contest/anticheat/captureLifecycle", () => ({
  stopCaptureForContest: vi.fn().mockReturnValue(true),
}));

// Minimal mock for useExamSubmissionProgress — executes handlers immediately
vi.mock("@/features/contest/hooks/useExamSubmissionProgress", () => ({
  default: () => ({
    run: vi.fn(async ({ handlers }) => {
      await handlers?.recording?.();
      await handlers?.finalizing?.();
      return true;
    }),
    state: { open: false, running: false, steps: [], errorMessage: null },
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string, fallback?: string) => fallback ?? k }),
}));

const makeConfig = (overrides = {}) => ({
  contestId: "contest-1",
  forceStopCapture: vi.fn(),
  forceStopWebcamCapture: vi.fn(),
  onRefresh: vi.fn().mockResolvedValue(undefined),
  onSuccess: vi.fn(),
  ...overrides,
});

describe("useForceSubmitArbiter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls serviceEndExam once when requestForceSubmit is called", async () => {
    const { endExam } = await import("@/infrastructure/api/repositories");
    const config = makeConfig();
    const { result } = renderHook(() => useForceSubmitArbiter(config));

    await act(async () => {
      await result.current.requestForceSubmit({
        reason: "test",
        sourceModule: "webcam",
        stopCaptureKey: "manual",
      });
    });

    expect(endExam).toHaveBeenCalledTimes(1);
    expect(endExam).toHaveBeenCalledWith("contest-1", expect.objectContaining({ source_module: "webcam" }));
  });

  it("CAS lock: two concurrent calls result in exactly one serviceEndExam call", async () => {
    const { endExam } = await import("@/infrastructure/api/repositories");
    const config = makeConfig();
    const { result } = renderHook(() => useForceSubmitArbiter(config));

    await act(async () => {
      await Promise.all([
        result.current.requestForceSubmit({
          reason: "webcam timeout",
          sourceModule: "webcam",
          stopCaptureKey: "manual",
        }),
        result.current.requestForceSubmit({
          reason: "viewport timeout",
          sourceModule: "screen_share",
          stopCaptureKey: "viewport_timeout_submit",
        }),
      ]);
    });

    expect(endExam).toHaveBeenCalledTimes(1);
  });

  it("calls onFinally even when serviceEndExam throws", async () => {
    const { endExam } = await import("@/infrastructure/api/repositories");
    (endExam as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("network error"));

    const config = makeConfig();
    const onFinally = vi.fn();
    const { result } = renderHook(() => useForceSubmitArbiter(config));

    await act(async () => {
      await result.current.requestForceSubmit({
        reason: "screen share timeout",
        sourceModule: "screen_share",
        stopCaptureKey: "screen_share_timeout_submit",
        onFinally,
      });
    });

    expect(onFinally).toHaveBeenCalledTimes(1);
  });

  it("allows a second submission after first completes (lock is released)", async () => {
    const { endExam } = await import("@/infrastructure/api/repositories");
    const config = makeConfig();
    const { result } = renderHook(() => useForceSubmitArbiter(config));

    await act(async () => {
      await result.current.requestForceSubmit({
        reason: "first",
        sourceModule: "webcam",
        stopCaptureKey: "manual",
      });
    });

    await act(async () => {
      await result.current.requestForceSubmit({
        reason: "second",
        sourceModule: "webcam",
        stopCaptureKey: "manual",
      });
    });

    // Two separate (sequential) submissions should both go through
    expect(endExam).toHaveBeenCalledTimes(2);
  });

  it("uses stopWebcamFirst order when requested", async () => {
    const config = makeConfig();
    const order: string[] = [];
    config.forceStopWebcamCapture = vi.fn(() => { order.push("webcam"); });
    config.forceStopCapture = vi.fn(() => { order.push("capture"); });

    const { stopCaptureForContest } = await import("@/features/contest/anticheat/captureLifecycle");
    (stopCaptureForContest as ReturnType<typeof vi.fn>).mockImplementation(() => {
      order.push("stopCapture");
      return false; // force fallback to forceStopCapture
    });

    const { result } = renderHook(() => useForceSubmitArbiter(config));

    await act(async () => {
      await result.current.requestForceSubmit({
        reason: "webcam primary",
        sourceModule: "webcam",
        stopCaptureKey: "manual",
        stopWebcamFirst: true,
      });
    });

    expect(order[0]).toBe("webcam");
    expect(order[1]).toBe("stopCapture");
  });

  it("sets isForceSubmitting to false after completion", async () => {
    const config = makeConfig();
    const { result } = renderHook(() => useForceSubmitArbiter(config));

    expect(result.current.isForceSubmitting).toBe(false);

    await act(async () => {
      await result.current.requestForceSubmit({
        reason: "test",
        sourceModule: "screen_share",
        stopCaptureKey: "viewport_timeout_submit",
      });
    });

    await waitFor(() => expect(result.current.isForceSubmitting).toBe(false));
  });

  it("runs beforeSubmitCapture before endExam", async () => {
    const { endExam } = await import("@/infrastructure/api/repositories");
    const beforeSubmitCapture = vi.fn().mockResolvedValue(undefined);
    const config = makeConfig({ beforeSubmitCapture });
    const { result } = renderHook(() => useForceSubmitArbiter(config));

    await act(async () => {
      await result.current.requestForceSubmit({
        reason: "test",
        sourceModule: "webcam",
        stopCaptureKey: "manual",
      });
    });

    expect(beforeSubmitCapture).toHaveBeenCalledTimes(1);
    expect(endExam).toHaveBeenCalledTimes(1);
  });
});
