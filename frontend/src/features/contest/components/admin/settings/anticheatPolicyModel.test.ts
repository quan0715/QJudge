import { createMockContest } from "@/shared/mocks/contest.mock";
import {
  getAccessPolicyView,
  getEvidencePolicyView,
  updateAllowedDevice,
  updateDesktopMultiDisplayAllowance,
  updateEvidenceTracking,
  updateDesktopWebcamAssist,
} from "./anticheatPolicyModel";

const defaultPolicy = () => createMockContest().anticheatDevicePolicy;

describe("anticheatPolicyModel", () => {
  it("maps legacy device policy into access and evidence views", () => {
    const policy = defaultPolicy();

    expect(getAccessPolicyView(policy)).toEqual({
      allowDesktop: true,
      allowTablet: true,
      allowDesktopMultiDisplay: false,
    });
    expect(getEvidencePolicyView(policy)).toEqual({
      enabled: true,
      desktopScreenShare: true,
      desktopWebcamAssist: false,
      tabletWebcam: true,
    });
  });

  describe("updateAllowedDevice", () => {
    it("disables desktop while keeping tablet unchanged", () => {
      const next = updateAllowedDevice(defaultPolicy(), "desktop", false);
      expect(next.desktop.enabled).toBe(false);
      expect(next.tablet.enabled).toBe(true);
    });

    it("disables tablet while keeping desktop unchanged", () => {
      const next = updateAllowedDevice(defaultPolicy(), "tablet", false);
      expect(next.tablet.enabled).toBe(false);
      expect(next.desktop.enabled).toBe(true);
    });

    it("enforces legacy constraints on every mutation", () => {
      const next = updateAllowedDevice(defaultPolicy(), "desktop", true);
      expect(next.desktop.detectors.focus).toBe(false);
      expect(next.desktop.detectors.tabVisibility).toBe(false);
      expect(next.tablet.sources.screenShare.enabled).toBe(false);
    });
  });

  describe("updateDesktopMultiDisplayAllowance", () => {
    it("sets multiDisplay detector to false when multi-display is allowed", () => {
      const next = updateDesktopMultiDisplayAllowance(defaultPolicy(), true);
      expect(next.desktop.detectors.multiDisplay).toBe(false);
    });

    it("sets multiDisplay detector to true when multi-display is forbidden", () => {
      const next = updateDesktopMultiDisplayAllowance(defaultPolicy(), false);
      expect(next.desktop.detectors.multiDisplay).toBe(true);
    });
  });

  describe("updateEvidenceTracking", () => {
    it("enables canonical sources: desktop screenShare + tablet webcam", () => {
      const next = updateEvidenceTracking(defaultPolicy(), true);
      expect(next.desktop.sources.screenShare.enabled).toBe(true);
      expect(next.tablet.sources.webcam.enabled).toBe(true);
      expect(next.tablet.sources.screenShare.enabled).toBe(false);
    });

    it("preserves desktop webcam state when enabling evidence", () => {
      // webcam originally off → stays off
      const policyWebcamOff = defaultPolicy();
      const nextOff = updateEvidenceTracking(policyWebcamOff, true);
      expect(nextOff.desktop.sources.webcam.enabled).toBe(false);

      // webcam originally on → stays on
      const policyWebcamOn = createMockContest({
        anticheatDevicePolicy: {
          ...defaultPolicy(),
          desktop: {
            ...defaultPolicy().desktop,
            sources: {
              ...defaultPolicy().desktop.sources,
              webcam: { enabled: true, captureIntervalSeconds: 10 },
            },
          },
        },
      }).anticheatDevicePolicy;
      const nextOn = updateEvidenceTracking(policyWebcamOn, true);
      expect(nextOn.desktop.sources.webcam.enabled).toBe(true);
    });

    it("disables all sources when evidence is turned off", () => {
      const next = updateEvidenceTracking(defaultPolicy(), false);
      expect(next.desktop.sources.screenShare.enabled).toBe(false);
      expect(next.desktop.sources.webcam.enabled).toBe(false);
      expect(next.tablet.sources.screenShare.enabled).toBe(false);
      expect(next.tablet.sources.webcam.enabled).toBe(false);
    });

    it("enforces legacy constraints even when raw policy has them on", () => {
      const rawPolicy = createMockContest({
        anticheatDevicePolicy: {
          desktop: {
            enabled: true,
            sources: {
              screenShare: { enabled: false, captureIntervalSeconds: 5 },
              webcam: { enabled: true, captureIntervalSeconds: 10 },
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
              screenShare: { enabled: true, captureIntervalSeconds: 5 },
              webcam: { enabled: false, captureIntervalSeconds: 10 },
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
        },
      }).anticheatDevicePolicy;

      const next = updateEvidenceTracking(rawPolicy, true);
      expect(next.desktop.detectors.focus).toBe(false);
      expect(next.desktop.detectors.tabVisibility).toBe(false);
      expect(next.tablet.detectors.focus).toBe(false);
      expect(next.tablet.detectors.tabVisibility).toBe(false);
      expect(next.tablet.sources.screenShare.enabled).toBe(false);
      expect(next.tablet.detectors.fullscreen).toBe(false);
      expect(next.tablet.detectors.multiDisplay).toBe(false);
    });
  });

  describe("updateDesktopWebcamAssist", () => {
    it("toggles desktop webcam independently", () => {
      const on = updateDesktopWebcamAssist(defaultPolicy(), true);
      expect(on.desktop.sources.webcam.enabled).toBe(true);

      const off = updateDesktopWebcamAssist(on, false);
      expect(off.desktop.sources.webcam.enabled).toBe(false);
    });
  });
});
