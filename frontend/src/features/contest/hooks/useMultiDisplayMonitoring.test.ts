import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useMultiDisplayMonitoring } from "./useMultiDisplayMonitoring";

// --- Mocks ---
vi.mock("@/infrastructure/api/repositories", () => ({
  recordExamEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/features/contest/anticheat/forcedCapture", () => ({
  recordExamEventWithForcedCapture: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/shared/state/examCaptureSessionStore", () => ({
  getExamCaptureSessionId: vi.fn().mockReturnValue(null),
}));

vi.mock("@/features/contest/anticheat/runtimeReauthState", () => ({
  isRuntimeScreenShareReauthActive: vi.fn().mockReturnValue(false),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const makeConfig = (overrides: Record<string, unknown> = {}) => ({
  contestId: "contest-1",
  enabled: true,
  examSubmitted: false,
  onViolation: vi.fn(),
  requestForceSubmit: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

describe("useMultiDisplayMonitoring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    Object.defineProperty(window.screen, "isExtended", {
      value: false,
      configurable: true,
    });
    delete (window as { getScreenDetails?: unknown }).getScreenDetails;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("multi-display detection triggers pipeline after 2 confirmations", async () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();

    Object.defineProperty(window, "getScreenDetails", {
      configurable: true,
      value: vi.fn().mockResolvedValue({
        screens: [{ id: 1 }, { id: 2 }],
        addEventListener,
        removeEventListener,
      }),
    });

    const config = makeConfig();
    const { result } = renderHook(() => useMultiDisplayMonitoring(config));

    // First poll — count=1, not yet triggered
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.recoveryCountdown).toBeNull();

    // Second poll — count=2, triggers pipeline
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(result.current.recoveryCountdown).toBe(10);
  });

  it("recovery clears countdown when single display restored", async () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    let screenCount = 2;

    Object.defineProperty(window, "getScreenDetails", {
      configurable: true,
      value: vi.fn().mockImplementation(async () => ({
        screens: Array.from({ length: screenCount }, (_, i) => ({ id: i + 1 })),
        addEventListener,
        removeEventListener,
      })),
    });

    const config = makeConfig();
    const { result } = renderHook(() => useMultiDisplayMonitoring(config));

    // Trigger: 2 polls with multi-display
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(result.current.recoveryCountdown).toBe(10);

    // Resolve: switch to single display
    screenCount = 1;
    Object.defineProperty(window.screen, "isExtended", { value: false, configurable: true });
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(result.current.recoveryCountdown).toBeNull();
  });

  it("enabled=false suppresses detection", async () => {
    Object.defineProperty(window.screen, "isExtended", {
      value: true,
      configurable: true,
    });

    const config = makeConfig({ enabled: false });
    const { result } = renderHook(() => useMultiDisplayMonitoring(config));

    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(result.current.recoveryCountdown).toBeNull();
  });

  it("exposes triggerCheck", () => {
    const config = makeConfig();
    const { result } = renderHook(() => useMultiDisplayMonitoring(config));
    expect(typeof result.current.triggerCheck).toBe("function");
  });
});
