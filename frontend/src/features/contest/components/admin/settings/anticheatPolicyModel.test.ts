import { createMockContest } from "@/shared/mocks/contest.mock";
import {
  getAccessPolicyView,
  getEvidencePolicyView,
  updateAllowedDevice,
  updateDesktopMultiDisplayAllowance,
  updateEvidenceSource,
} from "./anticheatPolicyModel";

const defaultPolicy = () => createMockContest().anticheatDevicePolicy;

describe("anticheatPolicyModel", () => {
  it("maps the device policy into access and evidence views", () => {
    const policy = defaultPolicy();

    expect(getAccessPolicyView(policy)).toEqual({
      allowDesktop: true,
      allowTablet: true,
      allowDesktopMultiDisplay: false,
    });
    expect(getEvidencePolicyView(policy)).toEqual({
      screenShare: true,
      webcam: true,
      webcamOnlyOn: "tablet",
      tabletAdvisory: "webcamOnly",
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

    it("enforces device constraints on every mutation", () => {
      const next = updateAllowedDevice(defaultPolicy(), "desktop", true);
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

  describe("getEvidencePolicyView", () => {
    const withSources = (desktopWebcam: boolean, tabletWebcam: boolean, screenShare = true) =>
      updateEvidenceSource(
        {
          ...defaultPolicy(),
          desktop: {
            ...defaultPolicy().desktop,
            sources: {
              screenShare: { enabled: screenShare },
              webcam: { enabled: desktopWebcam },
            },
          },
          tablet: {
            ...defaultPolicy().tablet,
            sources: {
              screenShare: { enabled: false },
              webcam: { enabled: tabletWebcam },
            },
          },
        },
        "screenShare",
        screenShare,
      );

    it("warns that an allowed tablet has no evidence without a webcam", () => {
      const view = getEvidencePolicyView(withSources(false, false));
      expect(view.webcam).toBe(false);
      expect(view.tabletAdvisory).toBe("noEvidence");
    });

    it("notes that tablets fall back to webcam only while screen share is on", () => {
      expect(getEvidencePolicyView(withSources(true, true)).tabletAdvisory).toBe("webcamOnly");
      expect(getEvidencePolicyView(withSources(true, true, false)).tabletAdvisory).toBeNull();
    });

    it("stays quiet about tablets once they are not allowed", () => {
      const policy = updateAllowedDevice(withSources(false, false), "tablet", false);
      expect(getEvidencePolicyView(policy).tabletAdvisory).toBeNull();
      expect(getEvidencePolicyView(policy).webcamOnlyOn).toBeNull();
    });

    it("reads webcam from the allowed devices only", () => {
      const desktopOnly = updateAllowedDevice(withSources(false, true), "tablet", false);
      expect(getEvidencePolicyView(desktopOnly).webcam).toBe(false);

      const tabletOnly = updateAllowedDevice(withSources(false, true), "desktop", false);
      expect(getEvidencePolicyView(tabletOnly).webcam).toBe(true);
    });
  });

  describe("updateEvidenceSource", () => {
    it("toggles screen share on desktop only", () => {
      const off = updateEvidenceSource(defaultPolicy(), "screenShare", false);
      expect(off.desktop.sources.screenShare.enabled).toBe(false);
      expect(off.tablet.sources.webcam.enabled).toBe(true);

      const on = updateEvidenceSource(off, "screenShare", true);
      expect(on.desktop.sources.screenShare.enabled).toBe(true);
      expect(on.tablet.sources.screenShare.enabled).toBe(false);
    });

    it("applies the webcam to desktop and tablet together", () => {
      const on = updateEvidenceSource(defaultPolicy(), "webcam", true);
      expect(on.desktop.sources.webcam.enabled).toBe(true);
      expect(on.tablet.sources.webcam.enabled).toBe(true);
      expect(getEvidencePolicyView(on).webcamOnlyOn).toBeNull();

      const off = updateEvidenceSource(on, "webcam", false);
      expect(off.desktop.sources.webcam.enabled).toBe(false);
      expect(off.tablet.sources.webcam.enabled).toBe(false);
    });
  });
});
