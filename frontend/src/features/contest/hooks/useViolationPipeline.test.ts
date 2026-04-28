import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useViolationPipeline } from "./useViolationPipeline";
import type { ViolationRouteConfig } from "@/features/contest/domain/violationRoutes";

// --- Mocks ---
const mockRecordExamEvent = vi.fn().mockResolvedValue(undefined);
const mockRecordExamEventWithForcedCapture = vi
  .fn()
  .mockResolvedValue(undefined);

vi.mock("@/infrastructure/api/repositories", () => ({
  recordExamEvent: (...args: unknown[]) => mockRecordExamEvent(...args),
}));

vi.mock("@/features/contest/anticheat/forcedCapture", () => ({
  recordExamEventWithForcedCapture: (...args: unknown[]) =>
    mockRecordExamEventWithForcedCapture(...args),
}));

vi.mock("@/shared/state/examCaptureSessionStore", () => ({
  getExamCaptureSessionId: vi.fn().mockReturnValue(null),
}));

vi.mock("@/features/contest/anticheat/runtimeReauthState", () => ({
  isRuntimeScreenShareReauthActive: vi.fn().mockReturnValue(false),
}));

// --- Helpers ---
const viewportRoute: ViolationRouteConfig = {
  id: "viewport",
  events: {
    triggered: "viewport_interrupted",
    escalated: "viewport_stopped",
    restored: "viewport_restored",
  },
  defaultGraceMs: 3000,
  escalation: "force_submit",
  countdownPriority: 2,
  eventSource: "anticheat:viewport_integrity",
};

const mouseLeaveRoute: ViolationRouteConfig = {
  id: "mouse_leave",
  events: { triggered: "mouse_leave_triggered", escalated: "mouse_leave" },
  defaultGraceMs: 3000,
  escalation: "penalized_event",
  countdownPriority: 4,
  eventSource: "anticheat:mouse_leave",
};

const continuedMouseLeaveRoute: ViolationRouteConfig = {
  ...mouseLeaveRoute,
  continued: {
    intervalMs: 30_000,
    maxEvents: 2,
    reason: "mouse_leave_continued",
  },
};

const webcamRoute: ViolationRouteConfig = {
  id: "webcam",
  events: {
    triggered: "webcam_interrupted",
    escalated: "webcam_stopped",
    restored: "webcam_restored",
  },
  defaultGraceMs: 10000,
  escalation: "force_submit",
  countdownPriority: 1,
  eventSource: "anticheat:webcam_capture",
};

const makeConfig = (overrides: Record<string, unknown> = {}) => ({
  route: viewportRoute,
  contestId: "contest-1",
  enabled: true,
  examSubmitted: false,
  moduleRole: "primary",
  requestForceSubmit: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

describe("useViolationPipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("trigger records triggered event and starts countdown", () => {
    const config = makeConfig();
    const { result } = renderHook(() => useViolationPipeline(config));

    act(() => {
      result.current.trigger();
    });

    expect(mockRecordExamEventWithForcedCapture).toHaveBeenCalledWith(
      "contest-1",
      "viewport_interrupted",
      expect.objectContaining({
        source: "anticheat:viewport_integrity",
        captureOptions: {
          eventType: "viewport_interrupted",
          modules: ["screen_share"],
        },
      }),
    );
    expect(result.current.isInterrupted).toBe(true);
    expect(result.current.recoveryCountdown).toBe(3);
  });

  it("recover before timeout cancels escalation and records restored", () => {
    const config = makeConfig();
    const { result } = renderHook(() => useViolationPipeline(config));

    act(() => {
      result.current.trigger();
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.recoveryCountdown).toBe(2);

    act(() => {
      result.current.recover("viewport_integrity_recovered");
    });

    expect(result.current.isInterrupted).toBe(false);
    expect(result.current.recoveryCountdown).toBeNull();
    expect(mockRecordExamEvent).toHaveBeenCalledWith(
      "contest-1",
      "viewport_restored",
      expect.objectContaining({
        metadata: expect.objectContaining({
          reason: "viewport_integrity_recovered",
        }),
      }),
    );

    // Advance past grace period — force submit should NOT fire
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(config.requestForceSubmit).not.toHaveBeenCalled();
  });

  it("timeout fires force_submit path with correct ForceSubmitRequest", () => {
    const config = makeConfig();
    const { result } = renderHook(() => useViolationPipeline(config));

    act(() => {
      result.current.trigger();
    });
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(config.requestForceSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "Force submit after viewport recovery timeout",
        sourceModule: "screen_share",
        stopCaptureKey: "viewport_timeout_submit",
      }),
    );
    expect(result.current.recoveryCountdown).toBeNull();
  });

  it("uses configured evidence modules for force-submit capture", async () => {
    const config = makeConfig({
      forceSubmitExtras: {
        sourceModule: "screen_share",
        evidenceCaptureModules: ["screen_share", "webcam"],
      },
    });
    const { result } = renderHook(() => useViolationPipeline(config));

    act(() => {
      result.current.trigger();
    });
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    const request = (config.requestForceSubmit as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    await act(async () => {
      await request.onRecording();
    });

    expect(mockRecordExamEventWithForcedCapture).toHaveBeenCalledWith(
      "contest-1",
      "exam_submit_initiated",
      expect.objectContaining({
        captureOptions: {
          eventType: "exam_submit_initiated",
          modules: ["screen_share", "webcam"],
        },
      }),
    );
  });

  it("timeout fires log_only path (no requestForceSubmit call)", () => {
    const config = makeConfig({
      route: webcamRoute,
      escalationOverride: "log_only" as const,
    });
    const { result } = renderHook(() => useViolationPipeline(config));

    act(() => {
      result.current.trigger();
    });
    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(config.requestForceSubmit).not.toHaveBeenCalled();
    expect(mockRecordExamEvent).toHaveBeenCalledWith(
      "contest-1",
      "webcam_stopped",
      expect.objectContaining({
        metadata: expect.objectContaining({ reason: "recovery_timeout" }),
      }),
    );
  });

  it("timeout fires penalized_event path (calls onViolation)", () => {
    const onViolation = vi.fn();
    const config = makeConfig({ route: mouseLeaveRoute, onViolation });
    const { result } = renderHook(() => useViolationPipeline(config));

    act(() => {
      result.current.trigger();
    });
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(onViolation).toHaveBeenCalledWith(
      "mouse_leave",
      "mouse_leave_recovery_timeout",
    );
    expect(config.requestForceSubmit).not.toHaveBeenCalled();
  });

  it("records continued penalized events until the incident recovers", () => {
    const onViolation = vi.fn();
    const config = makeConfig({ route: continuedMouseLeaveRoute, onViolation });
    const { result } = renderHook(() => useViolationPipeline(config));

    act(() => {
      result.current.trigger();
    });
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(onViolation).toHaveBeenCalledWith(
      "mouse_leave",
      "mouse_leave_recovery_timeout",
    );

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(onViolation).toHaveBeenCalledWith(
      "mouse_leave",
      "mouse_leave_continued",
    );

    act(() => {
      result.current.recover("mouse_returned");
    });
    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(onViolation).toHaveBeenCalledTimes(2);
  });

  it("caps continued events per incident", () => {
    const onViolation = vi.fn();
    const config = makeConfig({ route: continuedMouseLeaveRoute, onViolation });
    const { result } = renderHook(() => useViolationPipeline(config));

    act(() => {
      result.current.trigger();
    });
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    act(() => {
      vi.advanceTimersByTime(120_000);
    });

    const continuedCalls = onViolation.mock.calls.filter(
      (call) => call[1] === "mouse_leave_continued",
    );
    expect(continuedCalls).toHaveLength(2);
  });

  it("double trigger is idempotent", () => {
    const config = makeConfig();
    const { result } = renderHook(() => useViolationPipeline(config));

    act(() => {
      result.current.trigger();
    });
    act(() => {
      result.current.trigger();
    });

    // Only one triggered event
    const triggeredCalls =
      mockRecordExamEventWithForcedCapture.mock.calls.filter(
        (c: unknown[]) => c[1] === "viewport_interrupted",
      );
    expect(triggeredCalls).toHaveLength(1);
  });

  it("isSuppressed=true prevents trigger", () => {
    const config = makeConfig({ isSuppressed: () => true });
    const { result } = renderHook(() => useViolationPipeline(config));

    act(() => {
      result.current.trigger();
    });

    expect(result.current.isInterrupted).toBe(false);
    expect(mockRecordExamEvent).not.toHaveBeenCalled();
  });

  it("enabled=false prevents trigger", () => {
    const config = makeConfig({ enabled: false });
    const { result } = renderHook(() => useViolationPipeline(config));

    act(() => {
      result.current.trigger();
    });
    expect(result.current.isInterrupted).toBe(false);
  });

  it("examSubmitted=true prevents trigger", () => {
    const config = makeConfig({ examSubmitted: true });
    const { result } = renderHook(() => useViolationPipeline(config));

    act(() => {
      result.current.trigger();
    });
    expect(result.current.isInterrupted).toBe(false);
  });

  it("escalationOverride overrides route.escalation", () => {
    const config = makeConfig({
      route: webcamRoute,
      escalationOverride: "log_only" as const,
    });
    const { result } = renderHook(() => useViolationPipeline(config));

    act(() => {
      result.current.trigger();
    });
    act(() => {
      vi.advanceTimersByTime(10000);
    });

    // Should NOT call requestForceSubmit (webcam route default is force_submit)
    expect(config.requestForceSubmit).not.toHaveBeenCalled();
    // Should log the escalated event
    expect(mockRecordExamEvent).toHaveBeenCalledWith(
      "contest-1",
      "webcam_stopped",
      expect.objectContaining({
        metadata: expect.objectContaining({ reason: "recovery_timeout" }),
      }),
    );
  });

  it("unmount clears timers", () => {
    const config = makeConfig();
    const { result, unmount } = renderHook(() => useViolationPipeline(config));

    act(() => {
      result.current.trigger();
    });
    unmount();

    // Advance past grace period — force submit should NOT fire
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(config.requestForceSubmit).not.toHaveBeenCalled();
  });

  it("recoveryCountdown decrements correctly", () => {
    const config = makeConfig();
    const { result } = renderHook(() => useViolationPipeline(config));

    act(() => {
      result.current.trigger();
    });
    expect(result.current.recoveryCountdown).toBe(3);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.recoveryCountdown).toBe(2);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.recoveryCountdown).toBe(1);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    // Timer expired, countdown cleared
    expect(result.current.recoveryCountdown).toBeNull();
  });

  it("pipeline can retrigger after penalized_event escalation", () => {
    const onViolation = vi.fn();
    const config = makeConfig({ route: mouseLeaveRoute, onViolation });
    const { result } = renderHook(() => useViolationPipeline(config));

    // First trigger → escalation
    act(() => {
      result.current.trigger();
    });
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(onViolation).toHaveBeenCalledTimes(1);
    expect(result.current.isInterrupted).toBe(false);

    // Advance past escalation cooldown (10s)
    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    // Second trigger should work (not be blocked by stale interruptedRef)
    mockRecordExamEventWithForcedCapture.mockClear();
    act(() => {
      result.current.trigger();
    });
    expect(result.current.isInterrupted).toBe(true);
    expect(mockRecordExamEventWithForcedCapture).toHaveBeenCalledWith(
      "contest-1",
      "mouse_leave_triggered",
      expect.objectContaining({ source: "anticheat:mouse_leave" }),
    );

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(onViolation).toHaveBeenCalledTimes(2);
  });

  it("pipeline can retrigger after log_only escalation", () => {
    const config = makeConfig({
      route: webcamRoute,
      escalationOverride: "log_only" as const,
    });
    const { result } = renderHook(() => useViolationPipeline(config));

    // First trigger → escalation
    act(() => {
      result.current.trigger();
    });
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(result.current.isInterrupted).toBe(false);

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    mockRecordExamEventWithForcedCapture.mockClear();
    act(() => {
      result.current.trigger();
    });
    expect(result.current.isInterrupted).toBe(false);
    expect(mockRecordExamEventWithForcedCapture).not.toHaveBeenCalled();

    act(() => {
      result.current.recover("stream_recovered");
    });
    expect(mockRecordExamEvent).toHaveBeenCalledWith(
      "contest-1",
      "webcam_restored",
      expect.objectContaining({
        metadata: expect.objectContaining({ reason: "stream_recovered" }),
      }),
    );

    mockRecordExamEventWithForcedCapture.mockClear();
    act(() => {
      result.current.trigger();
    });
    expect(result.current.isInterrupted).toBe(true);
    expect(mockRecordExamEventWithForcedCapture).toHaveBeenCalledWith(
      "contest-1",
      "webcam_interrupted",
      expect.objectContaining({
        source: "anticheat:webcam_capture",
        captureOptions: {
          eventType: "webcam_interrupted",
          modules: ["webcam"],
        },
      }),
    );
  });

  it("pipeline can retrigger after force_submit escalation", () => {
    const config = makeConfig();
    const { result } = renderHook(() => useViolationPipeline(config));

    // First trigger → force_submit escalation
    act(() => {
      result.current.trigger();
    });
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(config.requestForceSubmit).toHaveBeenCalledTimes(1);
    expect(result.current.isInterrupted).toBe(false);

    // Simulate onFinally callback to clear isSubmittingRef
    const forceSubmitCall = (
      config.requestForceSubmit as ReturnType<typeof vi.fn>
    ).mock.calls[0][0];
    act(() => {
      forceSubmitCall.onFinally();
    });

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    act(() => {
      result.current.trigger();
    });
    expect(result.current.isInterrupted).toBe(false);

    act(() => {
      result.current.recover("viewport_integrity_recovered");
    });

    mockRecordExamEvent.mockClear();
    act(() => {
      result.current.trigger();
    });
    expect(result.current.isInterrupted).toBe(true);
    expect(result.current.recoveryCountdown).toBe(3);
  });

  it("restored event after escalation clears suppression so next incident records immediately", () => {
    const config = makeConfig({
      route: webcamRoute,
      escalationOverride: "log_only" as const,
    });
    const { result } = renderHook(() => useViolationPipeline(config));

    act(() => {
      result.current.trigger();
    });
    act(() => {
      vi.advanceTimersByTime(10000);
    });

    act(() => {
      result.current.recover("stream_recovered");
    });
    mockRecordExamEventWithForcedCapture.mockClear();

    act(() => {
      result.current.trigger();
    });

    expect(result.current.isInterrupted).toBe(true);
    expect(mockRecordExamEventWithForcedCapture).toHaveBeenCalledWith(
      "contest-1",
      "webcam_interrupted",
      expect.objectContaining({ source: "anticheat:webcam_capture" }),
    );
  });

  it("externalCountdown=true skips local timer but records events", () => {
    const config = makeConfig({ externalCountdown: true });
    const { result } = renderHook(() => useViolationPipeline(config));

    act(() => {
      result.current.trigger({ extra: "data" });
    });

    expect(result.current.isInterrupted).toBe(true);
    expect(result.current.recoveryCountdown).toBeNull(); // external mode
    expect(mockRecordExamEventWithForcedCapture).toHaveBeenCalledWith(
      "contest-1",
      "viewport_interrupted",
      expect.objectContaining({
        captureOptions: {
          eventType: "viewport_interrupted",
          modules: ["screen_share"],
        },
        metadata: expect.objectContaining({ extra: "data" }),
      }),
    );

    // Advance past grace — should NOT trigger force submit
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(config.requestForceSubmit).not.toHaveBeenCalled();

    act(() => {
      result.current.recover("user_reshared");
    });
    expect(result.current.isInterrupted).toBe(false);
    expect(mockRecordExamEvent).toHaveBeenCalledWith(
      "contest-1",
      "viewport_restored",
      expect.objectContaining({
        metadata: expect.objectContaining({ reason: "user_reshared" }),
      }),
    );
  });

  it("externalCountdown=true: recover without prior trigger is a no-op", () => {
    const config = makeConfig({ externalCountdown: true });
    const { result } = renderHook(() => useViolationPipeline(config));

    act(() => {
      result.current.recover("spurious_recover");
    });

    expect(result.current.isInterrupted).toBe(false);
    expect(result.current.recoveryCountdown).toBeNull();
    // No restored event should be recorded (wasn't interrupted)
    const restoredCalls = mockRecordExamEvent.mock.calls.filter(
      (c: unknown[]) => c[1] === "viewport_restored",
    );
    expect(restoredCalls).toHaveLength(0);
  });
});
