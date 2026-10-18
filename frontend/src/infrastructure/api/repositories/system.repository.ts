import { EnvelopeError, fetchEnvelope } from "@/infrastructure/api/envelope";
import { httpClient } from "@/infrastructure/api/http.client";
import type {
  AgentState,
  DeployedVersion,
  ReleaseCheck,
  SystemVersionState,
  UpgradeJob,
  UpgradeJobStatus,
  UpgradeStep,
} from "@/core/entities/systemVersion.entity";
import type { IngressEntry, IngressReport } from "@/core/entities/ingress.entity";

/** These pages render their own agent-state fallbacks, so keep API errors off the global toast. */
const LOCAL_ERRORS = { suppressGlobalError: true } as const;

interface UpgradeJobDto {
  id: string;
  target: string;
  triggered_by: string;
  started_at: string;
  finished_at: string | null;
  status: UpgradeJobStatus;
  step: UpgradeStep | null;
  site_healthy: boolean | null;
}

interface SystemVersionDto {
  tracked_branch?: string;
  agent: AgentState;
  version?: {
    current: string | null;
    previous: string | null;
    deployed_at: string | null;
  } | null;
  job?: UpgradeJobDto | null;
  log?: string;
  external_busy?: boolean;
}

interface ReleaseCheckDto {
  tracked_branch?: string;
  latest: { sha: string; subject: string; committed_at: string };
  releases: { sha: string; subject: string }[];
  update_available: boolean;
}

interface IngressDto {
  agent: AgentState;
  entries?: IngressEntry[];
}

const toJob = (dto: UpgradeJobDto): UpgradeJob => ({
  id: dto.id,
  target: dto.target,
  triggeredBy: dto.triggered_by,
  startedAt: dto.started_at,
  finishedAt: dto.finished_at,
  status: dto.status,
  step: dto.step,
  siteHealthy: dto.site_healthy,
});

const toVersion = (dto: NonNullable<SystemVersionDto["version"]>): DeployedVersion => ({
  current: dto.current,
  previous: dto.previous,
  deployedAt: dto.deployed_at,
});

export const getSystemVersion = async (): Promise<SystemVersionState> => {
  const { data } = await fetchEnvelope<SystemVersionDto>(
    httpClient.get("/api/v1/system/version", LOCAL_ERRORS),
    "Failed to load system version",
  );
  return {
    ...(data.tracked_branch ? { trackedBranch: data.tracked_branch } : {}),
    agent: data.agent,
    version: data.version ? toVersion(data.version) : null,
    job: data.job ? toJob(data.job) : null,
    log: data.log ?? "",
    externalBusy: data.external_busy ?? false,
  };
};

/** Asks the host which release is newest. An unavailable agent rejects with a 503 `EnvelopeError`. */
export const checkSystemUpdates = async (): Promise<ReleaseCheck> => {
  const { data } = await fetchEnvelope<ReleaseCheckDto>(
    httpClient.post("/api/v1/system/version/check", undefined, LOCAL_ERRORS),
    "Failed to check for updates",
  );
  return {
    ...(data.tracked_branch ? { trackedBranch: data.tracked_branch } : {}),
    latest: {
      sha: data.latest.sha,
      subject: data.latest.subject,
      committedAt: data.latest.committed_at,
    },
    releases: data.releases,
    updateAvailable: data.update_available,
  };
};

export type StartUpgradeResult =
  | { kind: "started"; job: UpgradeJob }
  | { kind: "busy" }
  | { kind: "notLatest"; latest: string };

export const startSystemUpgrade = async (target: string): Promise<StartUpgradeResult> => {
  try {
    const { data } = await fetchEnvelope<UpgradeJobDto>(
      httpClient.post("/api/v1/system/upgrade", { target }, LOCAL_ERRORS),
      "Failed to start the upgrade",
    );
    return { kind: "started", job: toJob(data) };
  } catch (error) {
    if (error instanceof EnvelopeError) {
      if (error.code === "agent_busy") return { kind: "busy" };
      if (error.code === "not_latest") {
        return { kind: "notLatest", latest: String(error.errors[0].details?.latest ?? "") };
      }
    }
    throw error;
  }
};

export const getIngress = async (): Promise<IngressReport> => {
  const { data } = await fetchEnvelope<IngressDto>(
    httpClient.get("/api/v1/system/ingress", LOCAL_ERRORS),
    "Failed to load ingress",
  );
  return { agent: data.agent, entries: data.entries ?? [] };
};
