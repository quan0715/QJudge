import {
  supportsDisplayMediaApi,
  supportsUserMediaApi,
} from "@/features/contest/anticheat/mediaApi";

export type DeviceClass = "desktop" | "tablet";
export type PointerProfile = "touch_only" | "touch_plus_pointer" | "mouse_like_pointer";
export type OsFamily = "windows" | "macos" | "linux" | "ipados" | "android_tablet" | "unknown";

export interface AnticheatDeviceClassification {
  deviceClass: DeviceClass;
  osFamily: OsFamily;
  isTablet: boolean;
  isIPadLike: boolean;
  isPwaMode: boolean;
  supportsFinePointer: boolean;
  supportsHover: boolean;
  pointerProfile: PointerProfile;
  screenShareSupported: boolean;
  webcamSupported: boolean;
}

const matchMediaSafe = (query: string): boolean => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(query).matches;
};

export const detectIPadLike = (): boolean => {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const maxTouchPoints = navigator.maxTouchPoints || 0;
  const uaDataPlatform = (
    navigator as Navigator & { userAgentData?: { platform?: string } }
  ).userAgentData?.platform;
  const hasCoarsePointer = matchMediaSafe("(pointer: coarse)");
  const hasHoverCapability = matchMediaSafe("(hover: hover)");
  const isIPadUA = /iPad/i.test(ua);
  const isTouchMac = /Mac/i.test(platform) && maxTouchPoints > 0 && !hasHoverCapability;
  const isDesktopLikeIpadUA =
    /Macintosh/i.test(ua) && (maxTouchPoints > 0 || hasCoarsePointer) && !hasHoverCapability;
  const isIOSUAData = typeof uaDataPlatform === "string" && /iOS/i.test(uaDataPlatform);
  return isIPadUA || isTouchMac || isDesktopLikeIpadUA || isIOSUAData;
};

const detectTablet = (): boolean => {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isAndroidTablet = /Android/i.test(ua) && (!/Mobile/i.test(ua) || /Tablet/i.test(ua));
  return detectIPadLike() || isAndroidTablet;
};

const detectOsFamily = (isTablet: boolean, isIPadLike: boolean): OsFamily => {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";

  if (isIPadLike) return "ipados";
  if (isTablet && /Android/i.test(ua)) return "android_tablet";
  if (/Win/i.test(platform)) return "windows";
  if (/Mac/i.test(platform)) return "macos";
  if (/Linux/i.test(platform) || /Linux/i.test(ua)) return "linux";
  return "unknown";
};

export const classifyAnticheatDevice = (): AnticheatDeviceClassification => {
  if (typeof navigator === "undefined") {
    return {
      deviceClass: "desktop",
      osFamily: "unknown",
      isTablet: false,
      isIPadLike: false,
      isPwaMode: false,
      supportsFinePointer: false,
      supportsHover: false,
      pointerProfile: "touch_only",
      screenShareSupported: false,
      webcamSupported: false,
    };
  }

  const isTablet = detectTablet();
  const isIPadLike = detectIPadLike();
  const supportsFinePointer = matchMediaSafe("(any-pointer: fine)") || matchMediaSafe("(pointer: fine)");
  const supportsHover = matchMediaSafe("(hover: hover)") || matchMediaSafe("(any-hover: hover)");
  const standaloneByDisplayMode =
    matchMediaSafe("(display-mode: standalone)") || matchMediaSafe("(display-mode: fullscreen)");
  const standaloneByIOS = Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  const maxTouchPoints = navigator.maxTouchPoints || 0;

  const pointerProfile: PointerProfile = (() => {
    if (supportsFinePointer && supportsHover) {
      return maxTouchPoints > 0 ? "touch_plus_pointer" : "mouse_like_pointer";
    }
    return "touch_only";
  })();

  return {
    deviceClass: isTablet ? "tablet" : "desktop",
    osFamily: detectOsFamily(isTablet, isIPadLike),
    isTablet,
    isIPadLike,
    isPwaMode: standaloneByDisplayMode || standaloneByIOS,
    supportsFinePointer,
    supportsHover,
    pointerProfile,
    screenShareSupported: supportsDisplayMediaApi(),
    webcamSupported: supportsUserMediaApi(),
  };
};
