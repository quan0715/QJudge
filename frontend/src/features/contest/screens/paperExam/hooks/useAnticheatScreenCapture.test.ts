import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useAnticheatScreenCapture } from "./useAnticheatScreenCapture";

// ── Mocks ──────────────────────────────────────────────────────────
vi.mock("./anticheat/useFrameQueue", () => ({
  useFrameQueue: () => ({ ensureQueue: vi.fn() }),
}));

vi.mock("./anticheat/useCanvasProcessor", () => ({
  useCanvasProcessor: () => ({ encodeUnderBudget: vi.fn() }),
}));

vi.mock("./anticheat/useAnticheatUploader", () => ({
  useAnticheatUploader: () => ({ uploadBatch: vi.fn().mockResolvedValue([]) }),
}));

vi.mock("@/features/contest/anticheat/forcedCapture", () => ({
  registerForcedCaptureHandler: vi.fn(),
  unregisterForcedCaptureHandler: vi.fn(),
}));

vi.mock("@/shared/state/examCaptureSessionStore", () => ({
  getExamCaptureSessionId: () => "test-session",
  setExamCaptureSessionId: vi.fn(),
}));

const mockClearPrecheck = vi.fn();
const mockClearRuntime = vi.fn();
const mockSetRuntimeHandoff = vi.fn();

// Track ended listeners — we fire them manually
type TrackEndedListener = () => void;
let trackEndedListeners: TrackEndedListener[] = [];

const createMockHandoffStream = (opts?: { active?: boolean }) => {
  trackEndedListeners = [];
  const mockTrack = {
    addEventListener: (event: string, listener: TrackEndedListener) => {
      if (event === "ended") trackEndedListeners.push(listener);
    },
    stop: vi.fn(),
  };
  const stream = {
    active: opts?.active ?? true,
    getTracks: () => [mockTrack],
    getVideoTracks: () => [mockTrack],
  };
  return stream as unknown as MediaStream;
};

let mockHandoffStream: MediaStream | null = null;

vi.mock("@/features/contest/anticheat/screenShareHandoffStore", () => ({
  consumePrecheckScreenShareHandoff: () => {
    const stream = mockHandoffStream;
    mockHandoffStream = null;
    return stream;
  },
  consumeRuntimeScreenShareHandoff: () => null,
  setRuntimeScreenShareHandoff: (...args: unknown[]) => mockSetRuntimeHandoff(...args),
  peekPrecheckScreenShareHandoff: () => mockHandoffStream,
  peekRuntimeScreenShareHandoff: () => null,
  clearPrecheckScreenShareHandoff: (...args: unknown[]) => mockClearPrecheck(...args),
  clearRuntimeScreenShareHandoff: (...args: unknown[]) => mockClearRuntime(...args),
}));

vi.mock("@/features/contest/constants/eventTaxonomy", () => ({
  getEventPriority: () => 0,
}));

// ── Helpers ────────────────────────────────────────────────────────
const CONTEST_ID = "contest-42";

/** Render the hook and acquire stream so it becomes live. */
async function setupWithLiveStream(opts?: { onScreenShareLost?: () => void }) {
  mockHandoffStream = createMockHandoffStream();
  const onScreenShareLost = opts?.onScreenShareLost ?? vi.fn();

  const hook = renderHook(() =>
    useAnticheatScreenCapture({
      contestId: CONTEST_ID,
      enabled: true,
      monitorStream: true,
      intervalMs: 100_000,
      onScreenShareLost,
    })
  );

  await act(async () => {
    await hook.result.current.forceCaptureNow("init", { eventType: "screen_share_stopped" });
  });

  return { ...hook, onScreenShareLost };
}

// ── Tests ──────────────────────────────────────────────────────────

describe("screen share loss detection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    trackEndedListeners = [];
    mockHandoffStream = null;
    mockSetRuntimeHandoff.mockReset();
  });

  afterEach(() => {
    mockHandoffStream = null;
  });

  // ── Primary path: track "ended" event ──────────────────────────

  it("fires onScreenShareLost when video track emits 'ended'", async () => {
    const { onScreenShareLost } = await setupWithLiveStream();

    expect(trackEndedListeners.length).toBeGreaterThan(0);

    act(() => trackEndedListeners.forEach((l) => l()));

    expect(onScreenShareLost).toHaveBeenCalledTimes(1);
  });

  it("does NOT fire onScreenShareLost if stream was already force-stopped", async () => {
    const { result, onScreenShareLost } = await setupWithLiveStream();

    act(() => result.current.forceStopCapture());
    act(() => trackEndedListeners.forEach((l) => l()));

    expect(onScreenShareLost).not.toHaveBeenCalled();
  });

  it("does not throw when onScreenShareLost is not provided", async () => {
    mockHandoffStream = createMockHandoffStream();

    const { result } = renderHook(() =>
      useAnticheatScreenCapture({
        contestId: CONTEST_ID,
        enabled: true,
        monitorStream: true,
        intervalMs: 100_000,
      })
    );

    await act(async () => {
      await result.current.forceCaptureNow("init", { eventType: "screen_share_stopped" });
    });

    // Should not throw
    act(() => trackEndedListeners.forEach((l) => l()));
  });

  // ── Fallback: capture loop detects inactive stream ─────────────

  it("fallback fires onScreenShareLost when stream silently becomes inactive", async () => {
    vi.useFakeTimers();

    const mockStream = createMockHandoffStream();
    mockHandoffStream = mockStream;
    const onScreenShareLost = vi.fn();

    const { result } = renderHook(() =>
      useAnticheatScreenCapture({
        contestId: CONTEST_ID,
        enabled: true,
        monitorStream: true,
        intervalMs: 100_000,
        onScreenShareLost,
      })
    );

    await act(async () => {
      await result.current.forceCaptureNow("init", { eventType: "screen_share_stopped" });
    });

    // Stream dies silently (no ended event)
    (mockStream as any).active = false;
    vi.advanceTimersByTime(20_000);

    await act(async () => {
      await result.current.forceCaptureNow("detect", { eventType: "screen_share_stopped" });
    });

    expect(onScreenShareLost).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("fallback fires only once per stream loss", async () => {
    vi.useFakeTimers();

    const mockStream = createMockHandoffStream();
    mockHandoffStream = mockStream;
    const onScreenShareLost = vi.fn();

    const { result } = renderHook(() =>
      useAnticheatScreenCapture({
        contestId: CONTEST_ID,
        enabled: true,
        monitorStream: true,
        intervalMs: 100_000,
        onScreenShareLost,
      })
    );

    await act(async () => {
      await result.current.forceCaptureNow("init", { eventType: "screen_share_stopped" });
    });

    (mockStream as any).active = false;
    vi.advanceTimersByTime(20_000);

    await act(async () => {
      await result.current.forceCaptureNow("detect-1", { eventType: "screen_share_stopped" });
    });
    vi.advanceTimersByTime(20_000);
    await act(async () => {
      await result.current.forceCaptureNow("detect-2", { eventType: "screen_share_stopped" });
    });

    expect(onScreenShareLost).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("triggers loss when initial handoff stream is already inactive", async () => {
    mockHandoffStream = createMockHandoffStream({ active: false });
    const onScreenShareLost = vi.fn();

    renderHook(() =>
      useAnticheatScreenCapture({
        contestId: CONTEST_ID,
        enabled: true,
        monitorStream: true,
        expectInitialStream: true,
        intervalMs: 100_000,
        onScreenShareLost,
      })
    );

    await waitFor(() => {
      expect(onScreenShareLost).toHaveBeenCalledTimes(1);
    });
  });

  it("triggers loss when initial handoff stream is missing but required", async () => {
    mockHandoffStream = null;
    const onScreenShareLost = vi.fn();

    renderHook(() =>
      useAnticheatScreenCapture({
        contestId: CONTEST_ID,
        enabled: true,
        monitorStream: true,
        expectInitialStream: true,
        intervalMs: 100_000,
        onScreenShareLost,
      })
    );

    await waitFor(() => {
      expect(onScreenShareLost).toHaveBeenCalledTimes(1);
    });
  });
});

describe("forceStopCapture cleans up all streams", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    trackEndedListeners = [];
    mockHandoffStream = null;
    mockSetRuntimeHandoff.mockReset();
  });

  afterEach(() => {
    mockHandoffStream = null;
  });

  it("clears both precheck and runtime handoff slots", async () => {
    const { result } = await setupWithLiveStream();

    act(() => result.current.forceStopCapture());

    expect(mockClearPrecheck).toHaveBeenCalledWith(true);
    expect(mockClearRuntime).toHaveBeenCalledWith(true);
  });

  it("clears handoff slots even when no active stream exists", () => {
    // No handoff stream — hook starts with null streamRef
    const { result } = renderHook(() =>
      useAnticheatScreenCapture({
        contestId: CONTEST_ID,
        enabled: true,
        monitorStream: true,
        intervalMs: 100_000,
      })
    );

    act(() => result.current.forceStopCapture());

    expect(mockClearPrecheck).toHaveBeenCalledWith(true);
    expect(mockClearRuntime).toHaveBeenCalledWith(true);
  });

  it("prevents stale ended listener from firing after forceStopCapture", async () => {
    const onScreenShareLost = vi.fn();
    const { result } = await setupWithLiveStream({ onScreenShareLost });

    expect(trackEndedListeners.length).toBeGreaterThan(0);

    // Submit exam → forceStopCapture
    act(() => result.current.forceStopCapture());

    // Stale ended event arrives late
    act(() => trackEndedListeners.forEach((l) => l()));

    expect(onScreenShareLost).not.toHaveBeenCalled();
  });

  it("force-stops capture on unmount", async () => {
    const { unmount } = await setupWithLiveStream();

    act(() => {
      unmount();
    });

    expect(mockClearPrecheck).toHaveBeenCalledWith(true);
    expect(mockClearRuntime).toHaveBeenCalledWith(true);
  });

  it("preserves live stream to runtime handoff on unmount when enabled", async () => {
    mockHandoffStream = createMockHandoffStream();
    const { result, unmount } = renderHook(() =>
      useAnticheatScreenCapture({
        contestId: CONTEST_ID,
        enabled: true,
        monitorStream: true,
        preserveStreamOnUnmount: true,
        intervalMs: 100_000,
      })
    );

    await act(async () => {
      await result.current.forceCaptureNow("init", { eventType: "screen_share_stopped" });
    });

    act(() => {
      unmount();
    });

    expect(mockSetRuntimeHandoff).toHaveBeenCalledTimes(1);
    expect(mockClearPrecheck).toHaveBeenCalledWith(true);
  });

  it("does not force-stop on monitor transition when preserve mode is enabled", async () => {
    mockHandoffStream = createMockHandoffStream();

    const { result, rerender } = renderHook(
      ({
        monitorStream,
        preserveStreamOnUnmount,
      }: {
        monitorStream: boolean;
        preserveStreamOnUnmount: boolean;
      }) =>
        useAnticheatScreenCapture({
          contestId: CONTEST_ID,
          enabled: true,
          monitorStream,
          preserveStreamOnUnmount,
          intervalMs: 100_000,
        }),
      {
        initialProps: {
          monitorStream: true,
          preserveStreamOnUnmount: true,
        },
      }
    );

    await act(async () => {
      await result.current.forceCaptureNow("init", { eventType: "screen_share_stopped" });
    });

    rerender({
      monitorStream: false,
      preserveStreamOnUnmount: true,
    });

    expect(mockClearPrecheck).not.toHaveBeenCalled();
    expect(mockClearRuntime).not.toHaveBeenCalled();
  });
});
