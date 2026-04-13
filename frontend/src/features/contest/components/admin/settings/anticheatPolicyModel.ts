import type { ContestAnticheatDevicePolicy } from "@/core/entities/contest.entity";
import { sanitizeAnticheatPolicy } from "./anticheatPolicyUtils";

export interface AnticheatAccessPolicyView {
  allowDesktop: boolean;
  allowTablet: boolean;
  allowDesktopMultiDisplay: boolean;
}

export interface AnticheatEvidencePolicyView {
  enabled: boolean;
  desktopScreenShare: boolean;
  desktopWebcamAssist: boolean;
  tabletWebcam: boolean;
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
  const policy = sanitizeAnticheatPolicy(rawPolicy);
  return {
    enabled:
      policy.desktop.sources.screenShare.enabled ||
      policy.desktop.sources.webcam.enabled ||
      policy.tablet.sources.webcam.enabled,
    desktopScreenShare: policy.desktop.sources.screenShare.enabled,
    desktopWebcamAssist: policy.desktop.sources.webcam.enabled,
    tabletWebcam: policy.tablet.sources.webcam.enabled,
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

export const updateEvidenceTracking = (
  rawPolicy: unknown,
  enabled: boolean,
): ContestAnticheatDevicePolicy => {
  const next = clonePolicy(rawPolicy);

  if (!enabled) {
    next.desktop.sources.screenShare.enabled = false;
    next.desktop.sources.webcam.enabled = false;
    next.tablet.sources.screenShare.enabled = false;
    next.tablet.sources.webcam.enabled = false;
    return sanitizeAnticheatPolicy(next);
  }

  next.desktop.sources.screenShare.enabled = true;
  next.tablet.sources.webcam.enabled = true;
  return sanitizeAnticheatPolicy(next);
};

export const updateDesktopWebcamAssist = (
  rawPolicy: unknown,
  enabled: boolean,
): ContestAnticheatDevicePolicy => {
  const next = clonePolicy(rawPolicy);
  next.desktop.sources.webcam.enabled = enabled;
  return sanitizeAnticheatPolicy(next);
};
