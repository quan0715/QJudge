/**
 * Shared normalization utilities for anticheat device policy.
 *
 * Both the settings screen (initial form state) and the form sections
 * (runtime policy editing) need identical normalization logic. This module
 * deduplicates the two former inline copies.
 */
import {
  DEFAULT_DEVICE_POLICY,
  type ContestAnticheatDevicePolicy,
} from "@/core/entities/contest.entity";

type DevicePolicy = ContestAnticheatDevicePolicy["desktop"];
type SourcePolicy = DevicePolicy["sources"]["screenShare"];
type DetectorsPolicy = DevicePolicy["detectors"];

export const normalizeSource = (
  source: unknown,
  fallback: SourcePolicy,
): SourcePolicy => {
  const src =
    source && typeof source === "object" && !Array.isArray(source)
      ? (source as Record<string, unknown>)
      : {};
  const interval = Number(
    src.captureIntervalSeconds ?? src.capture_interval_seconds ?? fallback.captureIntervalSeconds,
  );
  return {
    enabled: typeof src.enabled === "boolean" ? src.enabled : fallback.enabled,
    captureIntervalSeconds:
      Number.isFinite(interval) && interval > 0
        ? Math.floor(interval)
        : fallback.captureIntervalSeconds,
  };
};

export const normalizeDetectors = (
  detectors: unknown,
  fallback: DetectorsPolicy,
): DetectorsPolicy => {
  const det =
    detectors && typeof detectors === "object" && !Array.isArray(detectors)
      ? (detectors as Record<string, unknown>)
      : {};
  return {
    pwaMode:
      typeof det.pwaMode === "boolean"
        ? det.pwaMode
        : typeof det.pwa_mode === "boolean"
          ? (det.pwa_mode as boolean)
          : fallback.pwaMode,
    fullscreen:
      typeof det.fullscreen === "boolean" ? det.fullscreen : fallback.fullscreen,
    multiDisplay:
      typeof det.multiDisplay === "boolean"
        ? det.multiDisplay
        : typeof det.multi_display === "boolean"
          ? (det.multi_display as boolean)
          : fallback.multiDisplay,
    mouseLeave:
      typeof det.mouseLeave === "boolean"
        ? det.mouseLeave
        : typeof det.mouse_leave === "boolean"
          ? (det.mouse_leave as boolean)
          : fallback.mouseLeave,
    viewportIntegrity:
      typeof det.viewportIntegrity === "boolean"
        ? det.viewportIntegrity
        : typeof det.viewport_integrity === "boolean"
          ? (det.viewport_integrity as boolean)
          : fallback.viewportIntegrity,
  };
};

export const normalizeDevice = (
  device: unknown,
  fallback: DevicePolicy,
): DevicePolicy => {
  const item =
    device && typeof device === "object" && !Array.isArray(device)
      ? (device as Record<string, unknown>)
      : {};
  const sources =
    item.sources && typeof item.sources === "object" && !Array.isArray(item.sources)
      ? (item.sources as Record<string, unknown>)
      : {};
  return {
    enabled: typeof item.enabled === "boolean" ? item.enabled : fallback.enabled,
    sources: {
      screenShare: normalizeSource(
        sources.screenShare ?? sources.screen_share,
        fallback.sources.screenShare,
      ),
      webcam: normalizeSource(sources.webcam, fallback.sources.webcam),
    },
    detectors: normalizeDetectors(item.detectors, fallback.detectors),
  };
};

/**
 * Sanitize a raw policy object (from API or form state) into a fully
 * normalized `ContestAnticheatDevicePolicy`, enforcing device-specific
 * detector constraints (e.g. desktop cannot have pwaMode).
 */
export const sanitizeAnticheatPolicy = (
  policy: unknown,
): ContestAnticheatDevicePolicy => {
  const raw =
    policy && typeof policy === "object" && !Array.isArray(policy)
      ? (policy as Record<string, unknown>)
      : {};

  const sanitized = {
    desktop: normalizeDevice(raw.desktop, DEFAULT_DEVICE_POLICY.desktop),
    tablet: normalizeDevice(raw.tablet, DEFAULT_DEVICE_POLICY.tablet),
  };

  // High-level policy constraints — mirrors backend normalize_anticheat_device_policy().
  sanitized.desktop.detectors.pwaMode = false;
  sanitized.desktop.detectors.viewportIntegrity = false;
  sanitized.tablet.sources.screenShare.enabled = false;
  sanitized.tablet.detectors.fullscreen = false;
  sanitized.tablet.detectors.multiDisplay = false;

  return sanitized;
};
