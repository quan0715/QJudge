import { describe, expect, it, vi, afterEach } from "vitest";
import {
  buildExamEntryDeviceMetadata,
  computeEffectiveRequiredModules,
  detectAnticheatCapability,
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

describe("computeEffectiveRequiredModules", () => {
  it("keeps screen-share as primary on desktop when both sources are enabled", () => {
    const result = computeEffectiveRequiredModules(
      {
        screenShareSupported: true,
        webcamSupported: true,
        isTablet: false,
        isIPadLike: false,
        isPwaMode: false,
      },
      basePolicy
    );

    expect(result.screenShareEnabled).toBe(true);
    expect(result.webcamEnabled).toBe(true);
    expect(result.roles.screenShare).toBe("primary");
    expect(result.roles.webcam).toBe("secondary");
  });

  it("uses webcam as primary on tablet when screen-share is disabled", () => {
    const result = computeEffectiveRequiredModules(
      {
        screenShareSupported: false,
        webcamSupported: true,
        isTablet: true,
        isIPadLike: true,
        isPwaMode: false,
      },
      basePolicy
    );

    expect(result.screenShareEnabled).toBe(false);
    expect(result.webcamEnabled).toBe(true);
    expect(result.roles.webcam).toBe("primary");
    expect(result.roles.screenShare).toBeNull();
  });

  it("does not require webcam when unsupported", () => {
    const result = computeEffectiveRequiredModules(
      {
        screenShareSupported: false,
        webcamSupported: false,
        isTablet: true,
        isIPadLike: true,
        isPwaMode: false,
      },
      basePolicy
    );

    expect(result.screenShareEnabled).toBe(false);
    expect(result.webcamEnabled).toBe(false);
    expect(result.webcamEnabled).toBe(false);
    expect(result.roles.webcam).toBeNull();
  });

  it("resolves tablet runtime plan with webcam primary and fullscreen disabled", () => {
    const plan = resolveDeviceMonitoringPlan(
      {
        screenShareSupported: false,
        webcamSupported: true,
        isTablet: true,
        isIPadLike: true,
        isPwaMode: false,
      },
      basePolicy
    );

    expect(plan.deviceKind).toBe("tablet");
    expect(plan.allowed).toBe(true);
    expect(plan.sources.webcam.role).toBe("primary");
    expect(plan.precheck.requireFullscreen).toBe(false);
    expect(plan.precheck.requirePwaMode).toBe(true);
    expect(plan.runtime.enableViewportIntegrity).toBe(true);
  });

  it("enables viewport integrity for generic tablet capability", () => {
    const plan = resolveDeviceMonitoringPlan(
      {
        screenShareSupported: false,
        webcamSupported: true,
        isTablet: true,
        isIPadLike: false,
        isPwaMode: false,
      },
      basePolicy
    );

    expect(plan.deviceKind).toBe("tablet");
    expect(plan.runtime.enableViewportIntegrity).toBe(true);
  });

  it("builds exam entry metadata with active source list", () => {
    const capability = {
      screenShareSupported: true,
      webcamSupported: true,
      isTablet: false,
      isIPadLike: false,
      isPwaMode: false,
    };
    const plan = resolveDeviceMonitoringPlan(capability, basePolicy);
    const metadata = buildExamEntryDeviceMetadata(capability, plan);

    expect(metadata.device_kind).toBe("desktop");
    expect(metadata.primary_source_module).toBe("screen_share");
    expect(metadata.active_sources).toEqual(["screen_share", "webcam"]);
    expect(metadata.is_tablet).toBe(false);
  });

  it("treats enabled-but-unsupported source as missing", () => {
    const plan = resolveDeviceMonitoringPlan(
      {
        screenShareSupported: false,
        webcamSupported: true,
        isTablet: false,
        isIPadLike: false,
        isPwaMode: false,
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
