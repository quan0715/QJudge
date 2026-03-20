import { describe, expect, it } from "vitest";
import {
  buildExamEntryDeviceMetadata,
  computeEffectiveRequiredModules,
  resolveDeviceMonitoringPlan,
} from "./anticheatModulePolicy";

const basePolicy = {
  desktop: {
    enabled: true,
    sources: {
      screenShare: {
        enabled: true,
        required: true,
        captureIntervalSeconds: 5,
      },
      webcam: {
        enabled: true,
        required: false,
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
        required: false,
        captureIntervalSeconds: 5,
      },
      webcam: {
        enabled: true,
        required: true,
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
  it("keeps screen-share as primary on desktop when supported", () => {
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

    expect(result.requiredScreenShare).toBe(true);
    expect(result.requiredWebcam).toBe(false);
    expect(result.roles.screenShare).toBe("primary");
    expect(result.roles.webcam).toBe("secondary");
  });

  it("falls back to required webcam on tablet when screen-share unsupported", () => {
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

    expect(result.requiredScreenShare).toBe(false);
    expect(result.requiredWebcam).toBe(true);
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

    expect(result.requiredScreenShare).toBe(false);
    expect(result.requiredWebcam).toBe(false);
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
    expect(metadata.active_sources).toEqual(["screen_share"]);
    expect(metadata.is_tablet).toBe(false);
  });

  it("treats required-but-disabled source as missing", () => {
    const plan = resolveDeviceMonitoringPlan(
      {
        screenShareSupported: true,
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
              enabled: false,
              required: true,
            },
          },
        },
      },
    );

    expect(plan.allowed).toBe(false);
    expect(plan.missingRequiredSources).toContain("screen_share");
    expect(plan.runtime.enableScreenShareCapture).toBe(false);
  });
});
