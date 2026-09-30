import {
  supportsDisplayMediaApi,
  supportsUserMediaApi,
} from "@/features/contest/anticheat/mediaApi";

export interface AnticheatCapability {
  screenShareSupported: boolean;
  webcamSupported: boolean;
}

export type AnticheatSourceModule = "screen_share" | "webcam";

/**
 * Strict mode has one rule set: the screen share is the primary evidence and
 * fullscreen, multi-display and mouse-leave detection are always on. A browser
 * that cannot share its screen (tablets, phones) cannot take a strict exam.
 */
export interface DeviceMonitoringPlan {
  allowed: boolean;
  missingEnabledSources: AnticheatSourceModule[];
  sources: {
    screenShare: {
      enabled: boolean;
      available: boolean;
      active: boolean;
      role: "primary" | null;
    };
    webcam: {
      enabled: boolean;
      available: boolean;
      active: boolean;
      role: "secondary" | null;
    };
  };
  detectors: {
    fullscreen: boolean;
    multiDisplay: boolean;
    mouseLeave: boolean;
  };
  precheck: {
    requireScreenShare: boolean;
    requireWebcam: boolean;
    enableWebcam: boolean;
    requireSingleMonitor: boolean;
  };
  runtime: {
    enableScreenShareCapture: boolean;
    enableWebcamCapture: boolean;
    monitorScreenShareStream: boolean;
    monitorWebcamStream: boolean;
  };
}

export interface ExamEntryDeviceMetadata {
  screen_share_supported: boolean;
  webcam_supported: boolean;
  active_sources: AnticheatSourceModule[];
}

export const detectAnticheatCapability = (): AnticheatCapability => ({
  screenShareSupported: supportsDisplayMediaApi(),
  webcamSupported: supportsUserMediaApi(),
});

export const resolveDeviceMonitoringPlan = (
  capability: AnticheatCapability,
  webcamRequired: boolean,
): DeviceMonitoringPlan => {
  const screenShareActive = capability.screenShareSupported;
  const webcamActive = webcamRequired && capability.webcamSupported;
  const missingEnabledSources: AnticheatSourceModule[] = [];
  if (!screenShareActive) missingEnabledSources.push("screen_share");
  if (webcamRequired && !webcamActive) missingEnabledSources.push("webcam");

  return {
    allowed: missingEnabledSources.length === 0,
    missingEnabledSources,
    sources: {
      screenShare: {
        enabled: true,
        available: capability.screenShareSupported,
        active: screenShareActive,
        role: screenShareActive ? "primary" : null,
      },
      webcam: {
        enabled: webcamRequired,
        available: capability.webcamSupported,
        active: webcamActive,
        role: webcamActive ? "secondary" : null,
      },
    },
    detectors: { fullscreen: true, multiDisplay: true, mouseLeave: true },
    precheck: {
      requireScreenShare: screenShareActive,
      requireWebcam: webcamActive,
      enableWebcam: webcamActive,
      requireSingleMonitor: true,
    },
    runtime: {
      enableScreenShareCapture: screenShareActive,
      enableWebcamCapture: webcamActive,
      monitorScreenShareStream: screenShareActive,
      monitorWebcamStream: webcamActive,
    },
  };
};

export const buildExamEntryDeviceMetadata = (
  capability: AnticheatCapability,
  monitoringPlan: DeviceMonitoringPlan,
): ExamEntryDeviceMetadata => ({
  screen_share_supported: capability.screenShareSupported,
  webcam_supported: capability.webcamSupported,
  active_sources: [
    ...(monitoringPlan.runtime.enableScreenShareCapture ? ["screen_share" as const] : []),
    ...(monitoringPlan.runtime.enableWebcamCapture ? ["webcam" as const] : []),
  ],
});
