import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createEligibilityChecks,
  runStartPreflightValidation,
} from "./precheckEnvironment";
import { setPrecheckScreenShareHandoff, clearPrecheckScreenShareHandoff } from "@/features/contest/anticheat/screenShareHandoffStore";

const t = (_key: string, fallback?: string) => fallback ?? _key;

describe("precheckEnvironment", () => {
  it("adds attendance eligibility check when QR attendance is required", () => {
    const checks = createEligibilityChecks(t as never, { requireAttendance: true });

    expect(checks.map((check) => check.id)).toEqual([
      "participation",
      "submitted",
      "attendance",
    ]);
  });

  it("omits attendance eligibility check when QR attendance is not required", () => {
    const checks = createEligibilityChecks(t as never);

    expect(checks.map((check) => check.id)).toEqual([
      "participation",
      "submitted",
    ]);
  });
});


const fakeScreenStream = (displaySurface: string): MediaStream => {
  const track = {
    kind: "video",
    readyState: "live",
    enabled: true,
    muted: false,
    getSettings: () => ({ displaySurface }),
    addEventListener: () => {},
    removeEventListener: () => {},
    stop: () => {},
  };
  return {
    active: true,
    getTracks: () => [track],
    getVideoTracks: () => [track],
    getAudioTracks: () => [],
  } as unknown as MediaStream;
};

describe("runStartPreflightValidation observation", () => {
  afterEach(() => {
    clearPrecheckScreenShareHandoff(true);
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: null,
    });
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const baseOptions = {
    requireScreenShare: false,
    requireSingleMonitor: false,
    requireWebcam: false,
    enableWebcam: false,
    requirePwaOnTablet: false,
    isPwaMode: false,
    skipFullscreenCheck: true,
  };

  it("reports what it observed on the happy path", async () => {
    setPrecheckScreenShareHandoff(fakeScreenStream("monitor"));

    const { failure, observation } = await runStartPreflightValidation(t as never, {
      ...baseOptions,
      requireScreenShare: true,
    });

    expect(failure).toBeNull();
    expect(observation.display_surface).toBe("monitor");
    expect(observation.fullscreen).toBe(false);
  });

  it("still reports the observation when a check fails", async () => {
    setPrecheckScreenShareHandoff(fakeScreenStream("window"));

    const { failure, observation } = await runStartPreflightValidation(t as never, {
      ...baseOptions,
      requireScreenShare: true,
    });

    expect(failure?.checkId).toBe("shareScreen");
    expect(observation.display_surface).toBe("window");
  });

  it("records the fullscreen state that gated the start", async () => {
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: document.createElement("div"),
    });

    const { failure, observation } = await runStartPreflightValidation(t as never, {
      ...baseOptions,
      skipFullscreenCheck: false,
    });

    expect(failure).toBeNull();
    expect(observation.fullscreen).toBe(true);
  });
});
