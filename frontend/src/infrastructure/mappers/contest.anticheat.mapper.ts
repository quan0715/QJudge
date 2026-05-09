import {
  DEFAULT_DEVICE_POLICY,
  type ContestAnticheatConfig,
  type ContestAnticheatDevicePolicy,
} from "@/core/entities/contest.entity";
import type { AnticheatDevicePolicyDto } from "@/infrastructure/api/dto/contest.dto";

export const FIXED_SCREEN_SHARE_RECOVERY_GRACE_MS = 30_000;

const ensureObject = (
  value: unknown,
  path: string,
): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      `Invalid anti-cheat config payload: ${path} must be an object`,
    );
  }
  return value as Record<string, unknown>;
};

const ensureNumber = (
  obj: Record<string, unknown>,
  key: string,
  path: string,
): number => {
  const value = obj[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(
      `Invalid anti-cheat config payload: ${path}.${key} must be a number`,
    );
  }
  return value;
};

const ensureBoolean = (
  obj: Record<string, unknown>,
  key: string,
  path: string,
): boolean => {
  const value = obj[key];
  if (typeof value !== "boolean") {
    throw new Error(
      `Invalid anti-cheat config payload: ${path}.${key} must be a boolean`,
    );
  }
  return value;
};

const ensureString = (
  obj: Record<string, unknown>,
  key: string,
  path: string,
): string => {
  const value = obj[key];
  if (typeof value !== "string") {
    throw new Error(
      `Invalid anti-cheat config payload: ${path}.${key} must be a string`,
    );
  }
  return value;
};

const ensureStringArray = (
  obj: Record<string, unknown>,
  key: string,
  path: string,
): string[] => {
  const value = obj[key];
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string")
  ) {
    throw new Error(
      `Invalid anti-cheat config payload: ${path}.${key} must be string[]`,
    );
  }
  return value;
};

export function mapAnticheatDevicePolicyDto(
  value: AnticheatDevicePolicyDto | undefined,
): ContestAnticheatDevicePolicy {
  const root = value || {};

  const parseSource = (
    sourceValue: any,
    fallback: { enabled: boolean; captureIntervalSeconds: number },
  ) => {
    const source = sourceValue || {};
    return {
      enabled:
        typeof source.enabled === "boolean" ? source.enabled : fallback.enabled,
      captureIntervalSeconds:
        typeof source.capture_interval_seconds === "number"
          ? source.capture_interval_seconds
          : typeof source.captureIntervalSeconds === "number"
            ? source.captureIntervalSeconds
            : fallback.captureIntervalSeconds,
    };
  };

  const parseDetectors = (
    detectorValue: any,
    fallback: ContestAnticheatDevicePolicy["desktop"]["detectors"],
  ) => {
    const detectors = detectorValue || {};
    return {
      pwaMode:
        typeof detectors.pwa_mode === "boolean"
          ? detectors.pwa_mode
          : typeof detectors.pwaMode === "boolean"
            ? detectors.pwaMode
            : fallback.pwaMode,
      fullscreen:
        typeof detectors.fullscreen === "boolean"
          ? detectors.fullscreen
          : fallback.fullscreen,
      multiDisplay:
        typeof detectors.multi_display === "boolean"
          ? detectors.multi_display
          : typeof detectors.multiDisplay === "boolean"
            ? detectors.multiDisplay
            : fallback.multiDisplay,
      mouseLeave:
        typeof detectors.mouse_leave === "boolean"
          ? detectors.mouse_leave
          : typeof detectors.mouseLeave === "boolean"
            ? detectors.mouseLeave
            : fallback.mouseLeave,
      viewportIntegrity:
        typeof detectors.viewport_integrity === "boolean"
          ? detectors.viewport_integrity
          : typeof detectors.viewportIntegrity === "boolean"
            ? detectors.viewportIntegrity
            : fallback.viewportIntegrity,
    };
  };

  const parseDevice = (
    key: "desktop" | "tablet",
    fallback: ContestAnticheatDevicePolicy["desktop"],
  ) => {
    const item = root[key] || {};
    const sources = item.sources || {};
    return {
      enabled:
        typeof item.enabled === "boolean" ? item.enabled : fallback.enabled,
      sources: {
        screenShare: parseSource(
          sources.screen_share ?? (sources as any).screenShare,
          fallback.sources.screenShare,
        ),
        webcam: parseSource(sources.webcam, fallback.sources.webcam),
      },
      detectors: parseDetectors(item.detectors, fallback.detectors),
    };
  };

  return {
    desktop: parseDevice("desktop", DEFAULT_DEVICE_POLICY.desktop),
    tablet: parseDevice("tablet", DEFAULT_DEVICE_POLICY.tablet),
  };
}

export function mapContestAnticheatConfigDto(
  dto: unknown,
): ContestAnticheatConfig {
  const mapSetting = (item: unknown) => {
    const parsed = ensureObject(item, "frontend_controlled_settings item");
    return {
      key: ensureString(parsed, "key", "frontend_controlled_settings item"),
      description: ensureString(
        parsed,
        "description",
        "frontend_controlled_settings item",
      ),
    };
  };

  const root = ensureObject(dto, "root");
  const globalDefaults = ensureObject(
    root["global_defaults"],
    "global_defaults",
  );
  const contestSettings = ensureObject(
    root["contest_settings"],
    "contest_settings",
  );
  const effective = ensureObject(root["effective"], "effective");
  const frontendControlledSettings = ensureObject(
    root["frontend_controlled_settings"],
    "frontend_controlled_settings",
  );

  const rawGlobalSettings = frontendControlledSettings["global"];
  const rawContestSettings = frontendControlledSettings["contest"];
  if (!Array.isArray(rawGlobalSettings) || !Array.isArray(rawContestSettings)) {
    throw new Error(
      "Invalid anti-cheat config payload: frontend_controlled_settings.global/contest must be arrays",
    );
  }

  const version = root["version"];
  if (typeof version !== "number" || !Number.isFinite(version)) {
    throw new Error(
      "Invalid anti-cheat config payload: version must be a number",
    );
  }

  const rawDevicePolicy =
    root["device_policy"] ?? contestSettings["anticheat_device_policy"];
  const parsedDevicePolicy = mapAnticheatDevicePolicyDto(
    rawDevicePolicy as any,
  );

  return {
    version,
    globalDefaults: {
      captureIntervalSeconds: ensureNumber(
        globalDefaults,
        "capture_interval_seconds",
        "global_defaults",
      ),
      warningTimeoutSeconds: ensureNumber(
        effective,
        "warning_timeout_seconds",
        "effective",
      ),
      forcedCaptureCooldownMs: ensureNumber(
        globalDefaults,
        "forced_capture_cooldown_ms",
        "global_defaults",
      ),
      forcedCaptureP1CooldownMs: ensureNumber(
        globalDefaults,
        "forced_capture_p1_cooldown_ms",
        "global_defaults",
      ),
      eventFeedAggregationWindowSeconds: ensureNumber(
        globalDefaults,
        "event_feed_aggregation_window_seconds",
        "global_defaults",
      ),
      incidentScreenshotWindowBeforeMs: ensureNumber(
        globalDefaults,
        "incident_screenshot_window_before_ms",
        "global_defaults",
      ),
      incidentScreenshotWindowAfterMs: ensureNumber(
        globalDefaults,
        "incident_screenshot_window_after_ms",
        "global_defaults",
      ),
      incidentScreenshotPreviewLimit: ensureNumber(
        globalDefaults,
        "incident_screenshot_preview_limit",
        "global_defaults",
      ),
      incidentScreenshotCategories: ensureStringArray(
        globalDefaults,
        "incident_screenshot_categories",
        "global_defaults",
      ),
      monitoringRecoveryGraceMs: ensureNumber(
        globalDefaults,
        "monitoring_recovery_grace_ms",
        "global_defaults",
      ),
      mouseLeaveCooldownMs: ensureNumber(
        globalDefaults,
        "mouse_leave_cooldown_ms",
        "global_defaults",
      ),
      screenShareRecoveryGraceMs: FIXED_SCREEN_SHARE_RECOVERY_GRACE_MS,
      webcamRecoveryGraceMs: ensureNumber(
        globalDefaults,
        "webcam_recovery_grace_ms",
        "global_defaults",
      ),
      webcamCaptureIntervalSeconds: ensureNumber(
        globalDefaults,
        "webcam_capture_interval_seconds",
        "global_defaults",
      ),
      multiDisplayCheckIntervalMs: ensureNumber(
        globalDefaults,
        "multi_display_check_interval_ms",
        "global_defaults",
      ),
      multiDisplayReportCooldownMs: ensureNumber(
        globalDefaults,
        "multi_display_report_cooldown_ms",
        "global_defaults",
      ),
      presignedUrlTtlSeconds: ensureNumber(
        globalDefaults,
        "presigned_url_ttl_seconds",
        "global_defaults",
      ),
    },
    contestSettings: {
      cheatDetectionEnabled: ensureBoolean(
        contestSettings,
        "cheat_detection_enabled",
        "contest_settings",
      ),
      allowMultipleJoins: ensureBoolean(
        contestSettings,
        "allow_multiple_joins",
        "contest_settings",
      ),
      maxCheatWarnings: ensureNumber(
        contestSettings,
        "max_cheat_warnings",
        "contest_settings",
      ),
      contestType:
        ensureString(contestSettings, "contest_type", "contest_settings") ===
        "paper_exam"
          ? "paper_exam"
          : "coding",
      warningTimeoutSeconds: ensureNumber(
        contestSettings,
        "warning_timeout_seconds",
        "contest_settings",
      ),
      screenShareRecoveryGraceMs: FIXED_SCREEN_SHARE_RECOVERY_GRACE_MS,
      anticheatDevicePolicy: mapAnticheatDevicePolicyDto(
        contestSettings["anticheat_device_policy"] as any,
      ),
    },
    effective: {
      captureIntervalSeconds: ensureNumber(
        effective,
        "capture_interval_seconds",
        "effective",
      ),
      warningTimeoutSeconds: ensureNumber(
        effective,
        "warning_timeout_seconds",
        "effective",
      ),
      forcedCaptureCooldownMs: ensureNumber(
        effective,
        "forced_capture_cooldown_ms",
        "effective",
      ),
      forcedCaptureP1CooldownMs: ensureNumber(
        effective,
        "forced_capture_p1_cooldown_ms",
        "effective",
      ),
      eventFeedAggregationWindowSeconds: ensureNumber(
        effective,
        "event_feed_aggregation_window_seconds",
        "effective",
      ),
      incidentScreenshotWindowBeforeMs: ensureNumber(
        effective,
        "incident_screenshot_window_before_ms",
        "effective",
      ),
      incidentScreenshotWindowAfterMs: ensureNumber(
        effective,
        "incident_screenshot_window_after_ms",
        "effective",
      ),
      incidentScreenshotPreviewLimit: ensureNumber(
        effective,
        "incident_screenshot_preview_limit",
        "effective",
      ),
      incidentScreenshotCategories: ensureStringArray(
        effective,
        "incident_screenshot_categories",
        "effective",
      ),
      monitoringRecoveryGraceMs: ensureNumber(
        effective,
        "monitoring_recovery_grace_ms",
        "effective",
      ),
      mouseLeaveCooldownMs: ensureNumber(
        effective,
        "mouse_leave_cooldown_ms",
        "effective",
      ),
      screenShareRecoveryGraceMs: FIXED_SCREEN_SHARE_RECOVERY_GRACE_MS,
      webcamRecoveryGraceMs: ensureNumber(
        effective,
        "webcam_recovery_grace_ms",
        "effective",
      ),
      webcamCaptureIntervalSeconds: ensureNumber(
        effective,
        "webcam_capture_interval_seconds",
        "effective",
      ),
      multiDisplayCheckIntervalMs: ensureNumber(
        effective,
        "multi_display_check_interval_ms",
        "effective",
      ),
      multiDisplayReportCooldownMs: ensureNumber(
        effective,
        "multi_display_report_cooldown_ms",
        "effective",
      ),
      presignedUrlTtlSeconds: ensureNumber(
        effective,
        "presigned_url_ttl_seconds",
        "effective",
      ),
      cheatDetectionEnabled: ensureBoolean(
        effective,
        "cheat_detection_enabled",
        "effective",
      ),
      allowMultipleJoins: ensureBoolean(
        effective,
        "allow_multiple_joins",
        "effective",
      ),
      maxCheatWarnings: ensureNumber(
        effective,
        "max_cheat_warnings",
        "effective",
      ),
      contestType:
        ensureString(effective, "contest_type", "effective") === "paper_exam"
          ? "paper_exam"
          : "coding",
      anticheatDevicePolicy: mapAnticheatDevicePolicyDto(
        effective["anticheat_device_policy"] as any,
      ),
    },
    devicePolicy: parsedDevicePolicy,
    frontendControlledSettings: {
      global: rawGlobalSettings.map(mapSetting),
      contest: rawContestSettings.map(mapSetting),
    },
  };
}
