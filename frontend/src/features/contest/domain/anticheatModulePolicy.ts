import type {
  AnticheatDeviceKind,
  ContestAnticheatDevicePolicy,
  AnticheatDetectorKind,
} from "@/core/entities/contest.entity";
import {
  classifyAnticheatDevice,
  type DeviceClass,
  type OsFamily,
  type PointerProfile,
} from "./deviceClassification";

export interface AnticheatCapability {
  deviceClass: DeviceClass;
  osFamily: OsFamily;
  screenShareSupported: boolean;
  webcamSupported: boolean;
  isTablet: boolean;
  isIPadLike: boolean;
  isPwaMode: boolean;
  supportsFinePointer: boolean;
  supportsHover: boolean;
  pointerProfile: PointerProfile;
}

export type AnticheatSourceModule = "screen_share" | "webcam";

export interface DeviceMonitoringPlan {
  deviceKind: AnticheatDeviceKind;
  allowed: boolean;
  missingEnabledSources: AnticheatSourceModule[];
  sources: {
    screenShare: {
      enabled: boolean;
      captureIntervalSeconds: number;
      available: boolean;
      active: boolean;
      role: "primary" | "secondary" | null;
    };
    webcam: {
      enabled: boolean;
      captureIntervalSeconds: number;
      available: boolean;
      active: boolean;
      role: "primary" | "secondary" | null;
    };
  };
  detectors: {
    pwaMode: boolean;
    fullscreen: boolean;
    focus: boolean;
    tabVisibility: boolean;
    multiDisplay: boolean;
    mouseLeave: boolean;
    viewportIntegrity: boolean;
  };
  enabledDetectors: AnticheatDetectorKind[];
  precheck: {
    requireScreenShare: boolean;
    requireWebcam: boolean;
    enableWebcam: boolean;
    requireFullscreen: boolean;
    requirePwaMode: boolean;
    requireSingleMonitor: boolean;
  };
  runtime: {
    enableScreenShareCapture: boolean;
    enableWebcamCapture: boolean;
    monitorScreenShareStream: boolean;
    monitorWebcamStream: boolean;
    enableViewportIntegrity: boolean;
  };
  primarySourceModule: AnticheatSourceModule;
}

export interface ExamEntryDeviceMetadata {
  device_kind: AnticheatDeviceKind;
  is_tablet: boolean;
  is_ipad_like: boolean;
  is_pwa_mode: boolean;
  pointer_profile: PointerProfile;
  supports_fine_pointer: boolean;
  screen_share_supported: boolean;
  webcam_supported: boolean;
  primary_source_module: AnticheatSourceModule;
  active_sources: AnticheatSourceModule[];
}

export interface EvidenceCaptureStrategy {
  primarySourceModule: AnticheatSourceModule;
  enabledCaptureModules: AnticheatSourceModule[];
}

export const DEFAULT_DEVICE_POLICY: ContestAnticheatDevicePolicy = {
  desktop: {
    enabled: true,
    sources: {
      screenShare: {
        enabled: true,
        captureIntervalSeconds: 5,
      },
      webcam: {
        enabled: false,
        captureIntervalSeconds: 10,
      },
    },
    detectors: {
      pwaMode: false,
      fullscreen: true,
      focus: false,
      tabVisibility: false,
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
      focus: false,
      tabVisibility: false,
      multiDisplay: false,
      mouseLeave: true,
      viewportIntegrity: true,
    },
  },
};

export const detectAnticheatCapability = (): AnticheatCapability => {
  return classifyAnticheatDevice();
};

export const resolveDeviceMonitoringPlan = (
  capability: AnticheatCapability,
  policy: ContestAnticheatDevicePolicy | undefined
): DeviceMonitoringPlan => {
  const normalizedPolicy = policy ?? DEFAULT_DEVICE_POLICY;
  const deviceKind: AnticheatDeviceKind = capability.isTablet ? "tablet" : "desktop";
  const selected = normalizedPolicy[deviceKind] ?? DEFAULT_DEVICE_POLICY[deviceKind];

  const sources = {
    screenShare: {
      enabled: !!selected.sources.screenShare.enabled,
      captureIntervalSeconds: Math.max(
        1,
        Math.floor(selected.sources.screenShare.captureIntervalSeconds || 5)
      ),
      available: capability.screenShareSupported,
      active: !!selected.sources.screenShare.enabled && capability.screenShareSupported,
      role: null as "primary" | "secondary" | null,
    },
    webcam: {
      enabled: !!selected.sources.webcam.enabled,
      captureIntervalSeconds: Math.max(
        1,
        Math.floor(selected.sources.webcam.captureIntervalSeconds || 10)
      ),
      available: capability.webcamSupported,
      active: !!selected.sources.webcam.enabled && capability.webcamSupported,
      role: null as "primary" | "secondary" | null,
    },
  };

  const missingEnabledSources: AnticheatSourceModule[] = [];
  if (sources.screenShare.enabled && !sources.screenShare.active) {
    missingEnabledSources.push("screen_share");
  }
  if (sources.webcam.enabled && !sources.webcam.active) {
    missingEnabledSources.push("webcam");
  }

  if (sources.screenShare.active) {
    sources.screenShare.role = "primary";
    if (sources.webcam.active) {
      sources.webcam.role = "secondary";
    }
  } else if (sources.webcam.active) {
    sources.webcam.role = "primary";
  }

  const detectors = {
    pwaMode: !!selected.detectors.pwaMode,
    fullscreen: !!selected.detectors.fullscreen,
    // Legacy focus detectors stay in schema for compatibility, but no longer
    // participate in the primary runtime path.
    focus: false,
    tabVisibility: false,
    multiDisplay: !!selected.detectors.multiDisplay,
    mouseLeave: !!selected.detectors.mouseLeave && (!capability.isTablet || capability.supportsFinePointer),
    viewportIntegrity: !!selected.detectors.viewportIntegrity && capability.isTablet,
  };

  const enabledDetectors = (Object.keys(detectors) as AnticheatDetectorKind[]).filter(
    (key) => detectors[key]
  );

  const allowed = !!selected.enabled && missingEnabledSources.length === 0;
  const primarySourceModule: AnticheatSourceModule =
    sources.webcam.active && !sources.screenShare.active ? "webcam" : "screen_share";
  const screenShareActive = sources.screenShare.active;
  const webcamActive = sources.webcam.active;

  return {
    deviceKind,
    allowed,
    missingEnabledSources,
    sources,
    detectors,
    enabledDetectors,
    precheck: {
      requireScreenShare: screenShareActive,
      requireWebcam: webcamActive,
      enableWebcam: webcamActive,
      requireFullscreen: detectors.fullscreen && !detectors.pwaMode,
      requirePwaMode: detectors.pwaMode,
      requireSingleMonitor: detectors.multiDisplay,
    },
    runtime: {
      enableScreenShareCapture: screenShareActive,
      enableWebcamCapture: webcamActive,
      monitorScreenShareStream: screenShareActive,
      monitorWebcamStream: webcamActive,
      enableViewportIntegrity: detectors.viewportIntegrity,
    },
    primarySourceModule,
  };
};

export const resolveEvidenceCaptureStrategy = (
  monitoringPlan: DeviceMonitoringPlan
): EvidenceCaptureStrategy => {
  const enabledCaptureModules: AnticheatSourceModule[] = [];
  if (monitoringPlan.runtime.enableScreenShareCapture) {
    enabledCaptureModules.push("screen_share");
  }
  if (monitoringPlan.runtime.enableWebcamCapture) {
    enabledCaptureModules.push("webcam");
  }

  return {
    primarySourceModule: monitoringPlan.primarySourceModule,
    enabledCaptureModules,
  };
};

export const buildExamEntryDeviceMetadata = (
  capability: AnticheatCapability,
  monitoringPlan: DeviceMonitoringPlan
): ExamEntryDeviceMetadata => {
  const { enabledCaptureModules: activeSources } =
    resolveEvidenceCaptureStrategy(monitoringPlan);

  return {
    device_kind: monitoringPlan.deviceKind,
    is_tablet: capability.isTablet,
    is_ipad_like: capability.isIPadLike,
    is_pwa_mode: capability.isPwaMode,
    pointer_profile: capability.pointerProfile,
    supports_fine_pointer: capability.supportsFinePointer,
    screen_share_supported: capability.screenShareSupported,
    webcam_supported: capability.webcamSupported,
    primary_source_module: monitoringPlan.primarySourceModule,
    active_sources: activeSources,
  };
};
