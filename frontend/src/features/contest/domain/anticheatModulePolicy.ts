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
  requiredScreenShare: boolean;
  requiredWebcam: boolean;
  roles: {
    screenShare: "primary" | "secondary" | null;
    webcam: "primary" | "secondary" | null;
  };
}

export interface DeviceMonitoringPlan {
  deviceKind: AnticheatDeviceKind;
  allowed: boolean;
  missingRequiredSources: Array<"screen_share" | "webcam">;
  sources: {
    screenShare: {
      enabled: boolean;
      required: boolean;
      captureIntervalSeconds: number;
      available: boolean;
      active: boolean;
      role: "primary" | "secondary" | null;
    };
    webcam: {
      enabled: boolean;
      required: boolean;
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

const DEFAULT_DEVICE_POLICY: ContestAnticheatDevicePolicy = {
  desktop: {
    enabled: true,
    sources: {
      screenShare: {
        enabled: true,
        required: true,
        captureIntervalSeconds: 5,
      },
      webcam: {
        enabled: false,
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

  const requiredScreenShare = selectedDevicePolicy.sources.screenShare.required && screenShareEnabled;
  const requiredWebcam = selectedDevicePolicy.sources.webcam.required && webcamEnabled;

  const roles: EffectiveAnticheatModules["roles"] = {
    screenShare: null,
    webcam: null,
  };
  if (requiredScreenShare) {
    roles.screenShare = "primary";
    if (webcamEnabled) {
      roles.webcam = requiredWebcam ? "primary" : "secondary";
    }
  } else if (requiredWebcam) {
    roles.webcam = "primary";
    if (screenShareEnabled) {
      roles.screenShare = "secondary";
    }
  } else {
    if (screenShareEnabled) roles.screenShare = "secondary";
    if (webcamEnabled) roles.webcam = "secondary";
  }

  return {
    screenShareEnabled,
    webcamEnabled,
    requiredScreenShare,
    requiredWebcam,
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
      required: !!selected.sources.screenShare.required,
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
      required: !!selected.sources.webcam.required,
      captureIntervalSeconds: Math.max(
        1,
        Math.floor(selected.sources.webcam.captureIntervalSeconds || 10)
      ),
      available: capability.webcamSupported,
      active: !!selected.sources.webcam.enabled && capability.webcamSupported,
      role: null as "primary" | "secondary" | null,
    },
  };

  const missingRequiredSources: Array<"screen_share" | "webcam"> = [];
  if (sources.screenShare.required && !sources.screenShare.available) {
    missingRequiredSources.push("screen_share");
  }
  if (sources.webcam.required && !sources.webcam.available) {
    missingRequiredSources.push("webcam");
  }

  if (sources.screenShare.required && sources.screenShare.active) {
    sources.screenShare.role = "primary";
    if (sources.webcam.active) {
      sources.webcam.role = sources.webcam.required ? "primary" : "secondary";
    }
  } else if (sources.webcam.required && sources.webcam.active) {
    sources.webcam.role = "primary";
    if (sources.screenShare.active) {
      sources.screenShare.role = "secondary";
    }
  } else {
    if (sources.screenShare.active) sources.screenShare.role = "secondary";
    if (sources.webcam.active) sources.webcam.role = "secondary";
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

  const allowed = !!selected.enabled && missingRequiredSources.length === 0;
  const primarySourceModule: "screen_share" | "webcam" =
    sources.webcam.role === "primary" ? "webcam" : "screen_share";

  return {
    deviceKind,
    allowed,
    missingRequiredSources,
    sources,
    detectors,
    enabledDetectors,
    precheck: {
      requireScreenShare: sources.screenShare.required && sources.screenShare.active,
      requireWebcam: sources.webcam.required && sources.webcam.active,
      enableWebcam: sources.webcam.active,
      requireFullscreen: detectors.fullscreen,
      requirePwaMode: detectors.pwaMode,
    },
    runtime: {
      enableScreenShareCapture: sources.screenShare.active,
      enableWebcamCapture: sources.webcam.active,
      monitorScreenShareStream: sources.screenShare.active,
      monitorWebcamStream: sources.webcam.active,
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
