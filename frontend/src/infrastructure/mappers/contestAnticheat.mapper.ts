import type {
  ContestAnticheatConfig,
  ContestIntegrityRun,
  IntegrityRegistrySnapshot,
} from "@/core/entities/contest.entity";

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
     sessionState: ensureString(run, "session_state", "integrity_run"),
    health: ensureString(run, "health", "integrity_run"),
    participantId:
      participantId === null || participantId === undefined
        ? null
        : Number(participantId),
    policySnapshot,
    webcamRequired: policySnapshot.webcam_required === true,
    registrySnapshot: mapRegistrySnapshot(run.registry_snapshot),
  };
};

export function mapContestAnticheatConfigDto(dto: unknown): ContestAnticheatConfig {
  const root = ensureObject(dto, "root");
  return {
    webcamRequired: root.webcam_required === true,
    ...(root.integrity_run === undefined
      ? {}
      : { integrityRun: mapIntegrityRun(root.integrity_run) }),
  };
}
