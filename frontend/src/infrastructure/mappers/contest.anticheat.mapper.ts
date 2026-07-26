import {
  DEFAULT_DEVICE_POLICY,
  type ContestAnticheatConfig,
  type ContestAnticheatDevicePolicy,
  type ContestIntegrityRun,
  type IntegrityRegistrySnapshot,
} from "@/core/entities/contest.entity";
import type { AnticheatDevicePolicyDto } from "@/infrastructure/api/dto/contest.dto";

const ensureObject = (value: unknown, path: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid anti-cheat config payload: ${path} must be an object`);
  }
  return value as Record<string, unknown>;
};

const ensureString = (
  obj: Record<string, unknown>,
  key: string,
  path: string,
): string => {
  const value = obj[key];
  if (typeof value !== "string") {
    throw new Error(`Invalid anti-cheat config payload: ${path}.${key} must be a string`);
  }
  return value;
};

const mapRegistrySnapshot = (value: unknown): IntegrityRegistrySnapshot => {
  const registry = ensureObject(value, "integrity_run.registry_snapshot");
  return {
    version: ensureString(registry, "version", "integrity_run.registry_snapshot"),
    definitions: ensureObject(
      registry.definitions,
      "integrity_run.registry_snapshot.definitions",
    ),
  };
};

export function mapAnticheatDevicePolicyDto(
  value: AnticheatDevicePolicyDto | undefined,
): ContestAnticheatDevicePolicy {
  type DetectorDto = NonNullable<
    NonNullable<AnticheatDevicePolicyDto["desktop"]>["detectors"]
  >;
  const root = value || {};
  const parseSource = (
    sourceValue: { enabled?: boolean } | undefined,
    fallback: { enabled: boolean },
  ) => ({
    enabled:
      typeof sourceValue?.enabled === "boolean"
        ? sourceValue.enabled
        : fallback.enabled,
  });
  const parseDetectors = (
    value: DetectorDto | undefined,
    fallback: ContestAnticheatDevicePolicy["desktop"]["detectors"],
  ) => {
    const detectors = value || {};
    return {
      pwaMode:
        typeof detectors.pwa_mode === "boolean" ? detectors.pwa_mode : fallback.pwaMode,
      fullscreen:
        typeof detectors.fullscreen === "boolean" ? detectors.fullscreen : fallback.fullscreen,
      multiDisplay:
        typeof detectors.multi_display === "boolean"
          ? detectors.multi_display
          : fallback.multiDisplay,
      mouseLeave:
        typeof detectors.mouse_leave === "boolean"
          ? detectors.mouse_leave
          : fallback.mouseLeave,
      viewportIntegrity:
        typeof detectors.viewport_integrity === "boolean"
          ? detectors.viewport_integrity
          : fallback.viewportIntegrity,
    };
  };
  const parseDevice = (
    key: "desktop" | "tablet",
    fallback: ContestAnticheatDevicePolicy["desktop"],
  ) => {
    const item = root[key] || {};
    return {
      enabled: typeof item.enabled === "boolean" ? item.enabled : fallback.enabled,
      sources: {
        screenShare: parseSource(item.sources?.screen_share, fallback.sources.screenShare),
        webcam: parseSource(item.sources?.webcam, fallback.sources.webcam),
      },
      detectors: parseDetectors(item.detectors, fallback.detectors),
    };
  };
  return {
    desktop: parseDevice("desktop", DEFAULT_DEVICE_POLICY.desktop),
    tablet: parseDevice("tablet", DEFAULT_DEVICE_POLICY.tablet),
  };
}

const mapIntegrityRun = (value: unknown): ContestIntegrityRun => {
  const run = ensureObject(value, "integrity_run");
  const participantId = run.participant_id;
  if (
    participantId !== null &&
    participantId !== undefined &&
    !Number.isSafeInteger(Number(participantId))
  ) {
    throw new Error(
      "Invalid anti-cheat config payload: integrity_run.participant_id must be an integer",
    );
  }
  const policySnapshot = ensureObject(
    run.policy_snapshot,
    "integrity_run.policy_snapshot",
  );
  return {
    id: ensureString(run, "id", "integrity_run"),
    computeState: ensureString(run, "compute_state", "integrity_run"),
    health: ensureString(run, "health", "integrity_run"),
    participantId:
      participantId === null || participantId === undefined
        ? null
        : Number(participantId),
    policySnapshot,
    devicePolicy: mapAnticheatDevicePolicyDto(
      policySnapshot.device_policy as AnticheatDevicePolicyDto | undefined,
    ),
    registrySnapshot: mapRegistrySnapshot(run.registry_snapshot),
  };
};

export function mapContestAnticheatConfigDto(dto: unknown): ContestAnticheatConfig {
  const root = ensureObject(dto, "root");
  if (typeof root.version !== "number" || !Number.isFinite(root.version)) {
    throw new Error("Invalid anti-cheat config payload: version must be a number");
  }
  return {
    version: root.version,
    devicePolicy: mapAnticheatDevicePolicyDto(
      root.device_policy as AnticheatDevicePolicyDto | undefined,
    ),
    ...(root.integrity_run === undefined
      ? {}
      : { integrityRun: mapIntegrityRun(root.integrity_run) }),
  };
}
