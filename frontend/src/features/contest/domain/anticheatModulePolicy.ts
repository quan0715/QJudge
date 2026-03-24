import type {
  AnticheatDeviceKind,
  ContestAnticheatDevicePolicy,
  AnticheatDetectorKind,
} from "@/core/entities/contest.entity";
import {
  supportsDisplayMediaApi,
  supportsUserMediaApi,
} from "@/features/contest/anticheat/mediaApi";

export interface AnticheatCapability {
  screenShareSupported: boolean;
  webcamSupported: boolean;
  isTablet: boolean;
  isIPadLike: boolean;
  isPwaMode: boolean;
}

export interface EffectiveAnticheatModules {
  screenShareEnabled: boolean;
  webcamEnabled: boolean;
  roles: {
    screenShare: "primary" | "secondary" | null;
    webcam: "primary" | "secondary" | null;
  };
}

export interface DeviceMonitoringPlan {
  deviceKind: AnticheatDeviceKind;
  allowed: boolean;
  missingEnabledSources: Array<"screen_share" | "webcam">;
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
  };
  runtime: {
    enableScreenShareCapture: boolean;
    enableWebcamCapture: boolean;
    monitorScreenShareStream: boolean;
    monitorWebcamStream: boolean;
    enableViewportIntegrity: boolean;
  };
  primarySourceModule: "screen_share" | "webcam";
}

export interface ExamEntryDeviceMetadata {
  device_kind: AnticheatDeviceKind;
  is_tablet: boolean;
  is_ipad_like: boolean;
  is_pwa_mode: boolean;
  screen_share_supported: boolean;
  webcam_supported: boolean;
  primary_source_module: "screen_share" | "webcam";
  active_sources: Array<"screen_share" | "webcam">;
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

const detectIPadLike = (): boolean => {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const maxTouchPoints = navigator.maxTouchPoints || 0;
  const uaDataPlatform = (
    navigator as Navigator & { userAgentData?: { platform?: string } }
  ).userAgentData?.platform;
  const hasCoarsePointer =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches;
  const isIPadUA = /iPad/i.test(ua);
  const isTouchMac = /Mac/i.test(platform) && maxTouchPoints > 0;
  const isDesktopLikeIpadUA = /Macintosh/i.test(ua) && (maxTouchPoints > 0 || hasCoarsePointer);
  const isIOSUAData = typeof uaDataPlatform === "string" && /iOS/i.test(uaDataPlatform);
  return isIPadUA || isTouchMac || isDesktopLikeIpadUA || isIOSUAData;
};

const detectTablet = (): boolean => {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isIPadLike = detectIPadLike();
  const isAndroidTablet =
    /Android/i.test(ua) &&
    (!/Mobile/i.test(ua) || /Tablet/i.test(ua));
  return isIPadLike || isAndroidTablet;
};

export const detectAnticheatCapability = (): AnticheatCapability => {
  if (typeof navigator === "undefined") {
    return {
      screenShareSupported: false,
      webcamSupported: false,
      isTablet: false,
      isIPadLike: false,
      isPwaMode: false,
    };
  }
  const standaloneByDisplayMode =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    (window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: fullscreen)").matches);
  const standaloneByIOS = Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return {
    screenShareSupported: supportsDisplayMediaApi(),
    webcamSupported: supportsUserMediaApi(),
    isTablet: detectTablet(),
    isIPadLike: detectIPadLike(),
    isPwaMode: standaloneByDisplayMode || standaloneByIOS,
  };
};

export const computeEffectiveRequiredModules = (
  capability: AnticheatCapability,
  devicePolicy: ContestAnticheatDevicePolicy
): EffectiveAnticheatModules => {
  const deviceKind: AnticheatDeviceKind = capability.isTablet ? "tablet" : "desktop";
  const selectedDevicePolicy = devicePolicy[deviceKind];

  const screenShareEnabled =
    selectedDevicePolicy.sources.screenShare.enabled && capability.screenShareSupported;
  const webcamEnabled = selectedDevicePolicy.sources.webcam.enabled && capability.webcamSupported;

  const roles: EffectiveAnticheatModules["roles"] = {
    screenShare: null,
    webcam: null,
  };
  if (screenShareEnabled) {
    roles.screenShare = "primary";
    if (webcamEnabled) {
      roles.webcam = "secondary";
    }
  } else if (webcamEnabled) {
    roles.webcam = "primary";
  }

  return {
    screenShareEnabled,
    webcamEnabled,
    roles,
  };
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

  const missingEnabledSources: Array<"screen_share" | "webcam"> = [];
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
    focus: !!selected.detectors.focus,
    tabVisibility: !!selected.detectors.tabVisibility,
    multiDisplay: !!selected.detectors.multiDisplay,
    mouseLeave: !!selected.detectors.mouseLeave,
    viewportIntegrity: !!selected.detectors.viewportIntegrity && capability.isTablet,
  };

  const enabledDetectors = (Object.keys(detectors) as AnticheatDetectorKind[]).filter(
    (key) => detectors[key]
  );

  const allowed = !!selected.enabled && missingEnabledSources.length === 0;
  const primarySourceModule: "screen_share" | "webcam" =
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
      requireFullscreen: detectors.fullscreen,
      requirePwaMode: detectors.pwaMode,
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

export const buildExamEntryDeviceMetadata = (
  capability: AnticheatCapability,
  monitoringPlan: DeviceMonitoringPlan
): ExamEntryDeviceMetadata => {
  const activeSources: Array<"screen_share" | "webcam"> = [];
  if (monitoringPlan.runtime.enableScreenShareCapture) {
    activeSources.push("screen_share");
  }
  if (monitoringPlan.runtime.enableWebcamCapture) {
    activeSources.push("webcam");
  }

  return {
    device_kind: monitoringPlan.deviceKind,
    is_tablet: capability.isTablet,
    is_ipad_like: capability.isIPadLike,
    is_pwa_mode: capability.isPwaMode,
    screen_share_supported: capability.screenShareSupported,
    webcam_supported: capability.webcamSupported,
    primary_source_module: monitoringPlan.primarySourceModule,
    active_sources: activeSources,
  };
};
