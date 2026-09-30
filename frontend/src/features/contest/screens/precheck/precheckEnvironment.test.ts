import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SetStateAction } from "react";
import {
  applyPreflightFailureToEnvChecks,
  createEligibilityChecks,
  createEnvironmentChecks,
  runEnvChecks,
  runStartPreflightValidation,
  type CheckItem,
} from "./precheckEnvironment";
import { setPrecheckScreenShareHandoff, clearPrecheckScreenShareHandoff } from "@/features/contest/anticheat/screenShareHandoffStore";

const t = (_key: string, fallback?: string) => fallback ?? _key;

const mockWebglRenderer = (renderer: string, exposeRenderer = true) => {
  const gl = {
    RENDERER: 0x1f01,
    isContextLost: () => false,
    getParameter: (parameter: number) => parameter === 0x9246 ? renderer : "WebKit WebGL",
    getExtension: (name: string) => {
      if (name === "WEBGL_debug_renderer_info" && exposeRenderer) return { UNMASKED_RENDERER_WEBGL: 0x9246 };
      if (name === "WEBGL_lose_context") return { loseContext: () => {} };
      return null;
    },
  };
  return vi.spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue(gl as unknown as WebGLRenderingContext);
};

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
  beforeEach(() => {
    mockWebglRenderer("Apple M2");
  });

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
  };

  const enterFullscreen = () =>
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: document.createElement("div"),
    });

  it("reports what it observed on the happy path", async () => {
    enterFullscreen();
    setPrecheckScreenShareHandoff(fakeScreenStream("monitor"));

    const { failure, observation } = await runStartPreflightValidation(t as never, {
      ...baseOptions,
      requireScreenShare: true,
    });

    expect(failure).toBeNull();
    expect(observation.display_surface).toBe("monitor");
    expect(observation.fullscreen).toBe(true);
  });

  it("refuses to start outside fullscreen", async () => {
    const { failure, observation } = await runStartPreflightValidation(t as never, baseOptions);

    expect(failure?.checkId).toBe("fullscreen");
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
    enterFullscreen();

    const { failure, observation } = await runStartPreflightValidation(t as never, baseOptions);

    expect(failure).toBeNull();
    expect(observation.fullscreen).toBe(true);
  });
});

describe("graphics environment admission", () => {
  const options = {
    requireScreenShare: false,
    requireSingleMonitor: false,
    requireWebcam: false,
    enableWebcam: false,
  };

  // Admission runs after the fullscreen gate, so the accepted cases need it.
  beforeEach(() => {
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: document.createElement("div"),
    });
  });

  afterEach(() => {
    clearPrecheckScreenShareHandoff(true);
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: null,
    });
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each([
    "llvmpipe (LLVM 15.0.7, 256 bits)",
    "ANGLE (Mesa, LLVMPIPE (LLVM 15.0.7, 256 bits), OpenGL 4.5)",
  ])("rejects %s at final admission even when media checks are disabled", async (renderer) => {
    mockWebglRenderer(renderer);

    const { failure } = await runStartPreflightValidation(t as never, options);

    expect(failure).toMatchObject({ checkId: "graphics" });
    expect(failure?.detail).toBeTruthy();
  });

  it("allows a hardware renderer through final admission", async () => {
    mockWebglRenderer("ANGLE (NVIDIA, NVIDIA GeForce RTX 4060, OpenGL 4.5)");

    const { failure } = await runStartPreflightValidation(t as never, options);

    expect(failure).toBeNull();
  });

  it("rejects entry when neither WebGL version can create a context", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);

    const { failure } = await runStartPreflightValidation(t as never, options);

    expect(failure).toMatchObject({ checkId: "graphics" });
  });

  it("allows working WebGL when privacy settings hide the GPU name", async () => {
    mockWebglRenderer("", false);

    const { failure } = await runStartPreflightValidation(t as never, options);

    expect(failure).toBeNull();
  });

  it("falls back to WebGL 1 when WebGL 2 is unavailable", async () => {
    mockWebglRenderer("Intel Iris Xe").mockReturnValueOnce(null);

    const { failure } = await runStartPreflightValidation(t as never, options);

    expect(failure).toBeNull();
  });

  it("stops the environment check before requesting screen or webcam access", async () => {
    vi.useFakeTimers();
    mockWebglRenderer("llvmpipe (LLVM 15.0.7, 256 bits)");
    let checks: CheckItem[] = [];
    let done = false;
    let running = false;
    const setChecks = (update: SetStateAction<CheckItem[]>) => {
      checks = typeof update === "function" ? update(checks) : update;
    };
    const requestMonitorScreenShare = vi.fn().mockResolvedValue({
      granted: false, displaySurface: null, detail: "Screen permission denied",
    });
    const requestWebcamCapture = vi.fn().mockResolvedValue({
      granted: false, detail: "Webcam permission denied",
    });
    const check = runEnvChecks({
      ...options,
      requireScreenShare: true,
      enableWebcam: true,
      t: t as never,
      envTestRunning: false,
      requestMonitorScreenShare,
      requestWebcamCapture,
      lastInteractionAt: Date.now(),
      setStartGuardError: () => {},
      setEnvChecks: setChecks,
      setEnvTestDone: (update) => { done = typeof update === "function" ? update(done) : update; },
      setEnvTestRunning: (update) => { running = typeof update === "function" ? update(running) : update; },
    });
    await vi.runAllTimersAsync();
    await check;

    expect(checks.find((item) => item.id === "graphics")?.status).toBe("fail");
    expect(checks.filter((item) => item.id !== "graphics").every((item) => item.status === "blocked")).toBe(true);
    expect(requestMonitorScreenShare).not.toHaveBeenCalled();
    expect(requestWebcamCapture).not.toHaveBeenCalled();
    expect(done).toBe(true);
    expect(running).toBe(false);
  });

  it("invalidates previously passed checks when the renderer changes before entry", async () => {
    mockWebglRenderer("llvmpipe (LLVM 15.0.7, 256 bits)");
    let checks = createEnvironmentChecks(t as never).map((item) => ({ ...item, status: "pass" as const })) as CheckItem[];
    const { failure } = await runStartPreflightValidation(t as never, options);
    expect(failure).not.toBeNull();
    if (!failure) return;

    applyPreflightFailureToEnvChecks(failure, (update) => {
      checks = typeof update === "function" ? update(checks) : update;
    }, () => {}, () => {}, t as never);

    expect(checks.find((item) => item.id === "graphics")?.status).toBe("fail");
    expect(checks.filter((item) => item.id !== "graphics").every((item) => item.status === "blocked")).toBe(true);
  });
});
