/** Deployed version and online upgrade, as reported by the host deploy agent. */

export type AgentState = "ok" | "unsupported" | "unreachable";

export type UpgradeStep = "prepare" | "build" | "backup" | "migrate" | "switch" | "verify";

/** Upgrade steps in the order the host runs them. */
export const UPGRADE_STEPS: UpgradeStep[] = [
  "prepare",
  "build",
  "backup",
  "migrate",
  "switch",
  "verify",
];

export type UpgradeJobStatus = "running" | "succeeded" | "failed" | "interrupted";

export interface UpgradeJob {
  id: string;
  target: string;
  triggeredBy: string;
  startedAt: string;
  finishedAt: string | null;
  status: UpgradeJobStatus;
  step: UpgradeStep | null;
  siteHealthy: boolean | null;
}

export interface DeployedVersion {
  current: string | null;
  previous: string | null;
  deployedAt: string | null;
}

export interface SystemVersionState {
  agent: AgentState;
  version: DeployedVersion | null;
  job: UpgradeJob | null;
  log: string;
  externalBusy: boolean;
}

export interface ReleaseCheck {
  latest: { sha: string; subject: string; committedAt: string };
  releases: { sha: string; subject: string }[];
  updateAvailable: boolean;
}

/** Display form of a commit sha: `sha-` plus its first 12 characters. */
export const shortVersion = (sha: string): string => `sha-${sha.slice(0, 12)}`;
