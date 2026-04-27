import { describe, expect, it, vi, afterEach } from "vitest";
import {
  buildExamEntryDeviceMetadata,
  detectAnticheatCapability,
  resolveEvidenceCaptureStrategy,
  resolveDeviceMonitoringPlan,
} from "./anticheatModulePolicy";

const basePolicy = {
  desktop: {
    enabled: true,
    sources: {
      screenShare: {
        enabled: true,
        captureIntervalSeconds: 5,
      },
      webcam: {
        enabled: true,
        captureIntervalSeconds: 10,
      },
    },
    detectors: {
      pwaMode: false,
      fullscreen: true,
      focus: true,
      tabVisibility: true,
      multiDisplay: true,
      mouseLeave: true,
      viewportIntegrity: false,
    },
  },
  tablet: {
    enabled: true,
    sources: {
      screenShare: {
        enabled: false,
        captureIntervalSeconds: 5,
      },
      webcam: {
        enabled: true,
        captureIntervalSeconds: 10,
      },
    },
    detectors: {
      pwaMode: true,
      fullscreen: false,
      focus: true,
      tabVisibility: true,
      multiDisplay: false,
      mouseLeave: true,
      viewportIntegrity: true,
    },
  },
};

describe("resolveDeviceMonitoringPlan", () => {
  it("resolves tablet runtime plan with webcam primary and fullscreen disabled", () => {
    const plan = resolveDeviceMonitoringPlan(
      {
        deviceClass: "tablet",
        osFamily: "ipados",
        screenShareSupported: false,
        webcamSupported: true,
        isTablet: true,
        isIPadLike: true,
        isPwaMode: false,
        supportsFinePointer: false,
        supportsHover: false,
        pointerProfile: "touch_only",
      },
      basePolicy
    );

    expect(plan.deviceKind).toBe("tablet");
    expect(plan.allowed).toBe(true);
    expect(plan.sources.webcam.role).toBe("primary");
    expect(plan.precheck.requireFullscreen).toBe(false);
    expect(plan.precheck.requirePwaMode).toBe(true);
    expect(plan.detectors.focus).toBe(false);
    expect(plan.detectors.tabVisibility).toBe(false);
    expect(plan.detectors.mouseLeave).toBe(false);
    expect(plan.runtime.enableViewportIntegrity).toBe(true);
  });

  it("enables viewport integrity for generic tablet capability", () => {
    const plan = resolveDeviceMonitoringPlan(
      {
        deviceClass: "tablet",
        osFamily: "android_tablet",
        screenShareSupported: false,
        webcamSupported: true,
        isTablet: true,
        isIPadLike: false,
        isPwaMode: false,
        supportsFinePointer: false,
        supportsHover: false,
        pointerProfile: "touch_only",
      },
      basePolicy
    );

    expect(plan.deviceKind).toBe("tablet");
    expect(plan.runtime.enableViewportIntegrity).toBe(true);
  });

  it("builds exam entry metadata with active source list", () => {
    const capability = {
      deviceClass: "desktop" as const,
      osFamily: "macos" as const,
      screenShareSupported: true,
      webcamSupported: true,
      isTablet: false,
      isIPadLike: false,
      isPwaMode: false,
      supportsFinePointer: true,
      supportsHover: true,
      pointerProfile: "mouse_like_pointer" as const,
    };
    const plan = resolveDeviceMonitoringPlan(capability, basePolicy);
    const metadata = buildExamEntryDeviceMetadata(capability, plan);

    expect(metadata.device_kind).toBe("desktop");
    expect(metadata.primary_source_module).toBe("screen_share");
    expect(metadata.active_sources).toEqual(["screen_share", "webcam"]);
    expect(metadata.is_tablet).toBe(false);
    expect(metadata.supports_fine_pointer).toBe(true);
    expect(metadata.pointer_profile).toBe("mouse_like_pointer");
  });

  it("resolves evidence capture modules from active runtime sources", () => {
    const plan = resolveDeviceMonitoringPlan(
      {
        deviceClass: "desktop",
        osFamily: "macos",
        screenShareSupported: true,
        webcamSupported: true,
        isTablet: false,
        isIPadLike: false,
        isPwaMode: false,
        supportsFinePointer: true,
        supportsHover: true,
        pointerProfile: "mouse_like_pointer",
      },
      basePolicy
    );

    expect(resolveEvidenceCaptureStrategy(plan)).toEqual({
      primarySourceModule: "screen_share",
      enabledCaptureModules: ["screen_share", "webcam"],
    });
  });

  it("treats enabled-but-unsupported source as missing", () => {
    const plan = resolveDeviceMonitoringPlan(
      {
        deviceClass: "desktop",
        osFamily: "macos",
        screenShareSupported: false,
        webcamSupported: true,
        isTablet: false,
        isIPadLike: false,
        isPwaMode: false,
        supportsFinePointer: true,
        supportsHover: true,
        pointerProfile: "mouse_like_pointer",
      },
      {
        ...basePolicy,
        desktop: {
          ...basePolicy.desktop,
          sources: {
            ...basePolicy.desktop.sources,
            screenShare: {
              ...basePolicy.desktop.sources.screenShare,
              enabled: true,
            },
          },
        },
      },
    );

    expect(plan.allowed).toBe(false);
    expect(plan.missingEnabledSources).toContain("screen_share");
    expect(plan.runtime.enableScreenShareCapture).toBe(false);
  });

  it("enables tablet mouse_leave only when fine pointer is available", () => {
    const touchOnlyPlan = resolveDeviceMonitoringPlan(
      {
        deviceClass: "tablet",
        osFamily: "ipados",
        screenShareSupported: false,
        webcamSupported: true,
        isTablet: true,
        isIPadLike: true,
        isPwaMode: true,
        supportsFinePointer: false,
        supportsHover: false,
        pointerProfile: "touch_only",
      },
      basePolicy
    );
    const pointerPlan = resolveDeviceMonitoringPlan(
      {
        deviceClass: "tablet",
        osFamily: "ipados",
        screenShareSupported: false,
        webcamSupported: true,
        isTablet: true,
        isIPadLike: true,
        isPwaMode: true,
        supportsFinePointer: true,
        supportsHover: true,
        pointerProfile: "touch_plus_pointer",
      },
      basePolicy
    );

    expect(touchOnlyPlan.detectors.mouseLeave).toBe(false);
    expect(pointerPlan.detectors.mouseLeave).toBe(true);
  });
});

describe("detectAnticheatCapability — iPad vs touch Mac", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockNavigator = (overrides: Record<string, unknown>) => {
    Object.defineProperty(globalThis, "navigator", {
      value: {
        userAgent: "",
        platform: "",
        maxTouchPoints: 0,
        ...overrides,
      },
      writable: true,
      configurable: true,
    });
  };

  const mockMatchMedia = (results: Record<string, boolean>) => {
    vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
      matches: results[query] ?? false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  };

  it("touch Mac with hover capability is NOT detected as tablet", () => {
    mockNavigator({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      platform: "MacIntel",
      maxTouchPoints: 10,
    });
    mockMatchMedia({
      "(pointer: coarse)": true,
      "(hover: hover)": true,
    });

    const result = detectAnticheatCapability();
    expect(result.isTablet).toBe(false);
    expect(result.isIPadLike).toBe(false);
  });

  it("iPad (no hover) IS detected as tablet", () => {
    mockNavigator({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      platform: "MacIntel",
      maxTouchPoints: 5,
    });
    mockMatchMedia({
      "(pointer: coarse)": true,
      "(hover: hover)": false,
    });

    const result = detectAnticheatCapability();
    expect(result.isIPadLike).toBe(true);
    expect(result.isTablet).toBe(true);
  });

  it("desktop Mac (no touch, has hover) is NOT detected as tablet", () => {
    mockNavigator({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      platform: "MacIntel",
      maxTouchPoints: 0,
    });
    mockMatchMedia({
      "(pointer: coarse)": false,
      "(hover: hover)": true,
    });

    const result = detectAnticheatCapability();
    expect(result.isTablet).toBe(false);
    expect(result.isIPadLike).toBe(false);
  });

  it("explicit iPad UA is always detected regardless of hover", () => {
    mockNavigator({
      userAgent: "Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)",
      platform: "iPad",
      maxTouchPoints: 5,
    });
    mockMatchMedia({
      "(pointer: coarse)": true,
      "(hover: hover)": false,
    });

    const result = detectAnticheatCapability();
    expect(result.isIPadLike).toBe(true);
    expect(result.isTablet).toBe(true);
  });
});
