import type { ContestAnticheatDevicePolicy } from "@/core/entities/contest.entity";
import { sanitizeAnticheatPolicy } from "./anticheatPolicyUtils";

export interface AnticheatAccessPolicyView {
  allowDesktop: boolean;
  allowTablet: boolean;
  allowDesktopMultiDisplay: boolean;
}

export type TabletEvidenceAdvisory = "noEvidence" | "webcamOnly" | null;

export interface AnticheatEvidencePolicyView {
  /** Desktop screen share — tablets cannot share their screen. */
  screenShare: boolean;
  /** Webcam is required on at least one allowed device. */
  webcam: boolean;
  /** Set when both devices are allowed but only one of them requires a webcam. */
  webcamOnlyOn: "desktop" | "tablet" | null;
  /** Why an allowed tablet falls short of the configured evidence. */
  tabletAdvisory: TabletEvidenceAdvisory;
}

export const getAccessPolicyView = (
  rawPolicy: unknown,
): AnticheatAccessPolicyView => {
  const policy = sanitizeAnticheatPolicy(rawPolicy);
  return {
    allowDesktop: policy.desktop.enabled,
    allowTablet: policy.tablet.enabled,
    allowDesktopMultiDisplay: !policy.desktop.detectors.multiDisplay,
  };
};

export const getEvidencePolicyView = (
  rawPolicy: unknown,
): AnticheatEvidencePolicyView => {
  const { desktop, tablet } = sanitizeAnticheatPolicy(rawPolicy);
  const desktopWebcam = desktop.sources.webcam.enabled;
  const tabletWebcam = tablet.sources.webcam.enabled;
  const screenShare = desktop.sources.screenShare.enabled;
  const noDeviceAllowed = !desktop.enabled && !tablet.enabled;
  const webcam =
    (desktopWebcam && (desktop.enabled || noDeviceAllowed)) ||
    (tabletWebcam && (tablet.enabled || noDeviceAllowed));

  let tabletAdvisory: TabletEvidenceAdvisory = null;
  if (tablet.enabled && !tabletWebcam) tabletAdvisory = "noEvidence";
  else if (tablet.enabled && screenShare) tabletAdvisory = "webcamOnly";

  return {
    screenShare,
    webcam,
    webcamOnlyOn:
      desktop.enabled && tablet.enabled && desktopWebcam !== tabletWebcam
        ? desktopWebcam ? "desktop" : "tablet"
        : null,
    tabletAdvisory,
  };
};

const clonePolicy = (rawPolicy: unknown): ContestAnticheatDevicePolicy => {
  return sanitizeAnticheatPolicy(rawPolicy);
};

export const updateAllowedDevice = (
  rawPolicy: unknown,
  device: "desktop" | "tablet",
  enabled: boolean,
): ContestAnticheatDevicePolicy => {
  const next = clonePolicy(rawPolicy);
  next[device].enabled = enabled;
  return sanitizeAnticheatPolicy(next);
};

export const updateDesktopMultiDisplayAllowance = (
  rawPolicy: unknown,
  allowDesktopMultiDisplay: boolean,
): ContestAnticheatDevicePolicy => {
  const next = clonePolicy(rawPolicy);
  next.desktop.detectors.multiDisplay = !allowDesktopMultiDisplay;
  return sanitizeAnticheatPolicy(next);
};

/**
 * Screen share only exists on desktop; the webcam toggle applies to every
 * device so one switch means the same thing for desktop and tablet students.
 */
export const updateEvidenceSource = (
  rawPolicy: unknown,
  source: "screenShare" | "webcam",
  enabled: boolean,
): ContestAnticheatDevicePolicy => {
  const next = clonePolicy(rawPolicy);
  if (source === "screenShare") {
    next.desktop.sources.screenShare.enabled = enabled;
  } else {
    next.desktop.sources.webcam.enabled = enabled;
    next.tablet.sources.webcam.enabled = enabled;
  }
  return sanitizeAnticheatPolicy(next);
};
