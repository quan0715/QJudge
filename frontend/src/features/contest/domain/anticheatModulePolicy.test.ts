import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildExamEntryDeviceMetadata,
  detectAnticheatCapability,
  resolveDeviceMonitoringPlan,
} from "./anticheatModulePolicy";

const desktop = { screenShareSupported: true, webcamSupported: true };

describe("resolveDeviceMonitoringPlan", () => {
  it("records only the screen when the contest does not require a webcam", () => {
    const plan = resolveDeviceMonitoringPlan(desktop, false);

    expect(plan.allowed).toBe(true);
    expect(plan.sources.screenShare).toMatchObject({ active: true, role: "primary" });
    expect(plan.sources.webcam).toMatchObject({ enabled: false, active: false, role: null });
    expect(plan.detectors).toEqual({ fullscreen: true, multiDisplay: true, mouseLeave: true });
    expect(plan.precheck).toEqual({
      requireScreenShare: true,
      requireWebcam: false,
      enableWebcam: false,
      requireSingleMonitor: true,
    });
  });

  it("adds the webcam as a secondary source when the contest requires it", () => {
    const plan = resolveDeviceMonitoringPlan(desktop, true);

    expect(plan.allowed).toBe(true);
    expect(plan.sources.webcam).toMatchObject({ enabled: true, active: true, role: "secondary" });
    expect(plan.runtime).toEqual({
      enableScreenShareCapture: true,
      enableWebcamCapture: true,
      monitorScreenShareStream: true,
      monitorWebcamStream: true,
    });
  });

  it("refuses a browser that cannot share its screen, such as a tablet", () => {
    const plan = resolveDeviceMonitoringPlan(
      { screenShareSupported: false, webcamSupported: true },
      false,
    );

    expect(plan.allowed).toBe(false);
    expect(plan.missingEnabledSources).toEqual(["screen_share"]);
    expect(plan.sources.screenShare.role).toBeNull();
  });

  it("refuses a required webcam the browser cannot open", () => {
    const plan = resolveDeviceMonitoringPlan(
      { screenShareSupported: true, webcamSupported: false },
      true,
    );

    expect(plan.allowed).toBe(false);
    expect(plan.missingEnabledSources).toEqual(["webcam"]);
  });
});

describe("buildExamEntryDeviceMetadata", () => {
  it("reports capability and the sources that will record", () => {
    const plan = resolveDeviceMonitoringPlan(desktop, true);

    expect(buildExamEntryDeviceMetadata(desktop, plan)).toEqual({
      screen_share_supported: true,
      webcam_supported: true,
      active_sources: ["screen_share", "webcam"],
    });
  });
});

describe("detectAnticheatCapability", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads screen share and webcam support from the media APIs", () => {
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn() } });

    expect(detectAnticheatCapability()).toEqual({
      screenShareSupported: false,
      webcamSupported: true,
    });
  });
});
