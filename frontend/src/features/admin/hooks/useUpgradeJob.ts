import { useCallback, useEffect, useRef, useState } from "react";

import type { SystemVersionState } from "@/core/entities/systemVersion.entity";
import {
  getSystemVersion,
  startSystemUpgrade,
  type StartUpgradeResult,
} from "@/infrastructure/api/repositories/system.repository";

export type UpgradePhase =
  | "loading"
  | "unsupported"
  | "unreachable"
  | "idle"
  | "running"
  | "switching"
  | "succeeded"
  | "failed"
  | "interrupted"
  | "external";

export const POLL_INTERVAL_MS = 3000;

/**
 * How long polls may keep failing before "switching" stops being a normal answer. A switch
 * takes about a minute, so past this the site is probably down and the host job result cannot
 * reach this page, which reads it through the same backend.
 */
export const SWITCHING_WARN_AFTER_MS = 10 * 60 * 1000;

/**
 * How long the page keeps asking again while the host agent cannot be reached. The agent
 * restarts itself right after an upgrade, so a page that loads or reloads then is usually a few
 * seconds early. Past this the agent is probably down for good, and the reconnect button remains.
 */
export const UNREACHABLE_RETRY_MS = 2 * 60 * 1000;

const reloadPage = () => window.location.reload();

/** An upgrade is under way, started here, by another admin, or by the terminal or CD. */
const isBusy = (state: SystemVersionState | null) =>
  state !== null && (state.job?.status === "running" || state.externalBusy);

/**
 * The host keeps the last job until the agent runs another, so a release from the terminal or CD
 * that deployed after the job finished makes its result old news. A successful job records the
 * deployed version before its finish time, so a deploy in the same second is still its own.
 */
const isSuperseded = (state: SystemVersionState): boolean => {
  const finishedAt = state.job?.finishedAt;
  const deployedAt = state.version?.deployedAt;
  if (!finishedAt || !deployedAt) return false;
  return Date.parse(deployedAt) > Date.parse(finishedAt);
};

const derivePhase = (
  state: SystemVersionState | null,
  error: string,
  switching: boolean,
): UpgradePhase => {
  if (state === null) return error ? "unreachable" : "loading";
  if (state.agent !== "ok") return state.agent;
  if (state.externalBusy) return "external";
  if (!state.job) return "idle";
  if (state.job.status === "running") return switching ? "switching" : "running";
  if (isSuperseded(state)) return "idle";
  return state.job.status;
};

const POLLING_PHASES: UpgradePhase[] = ["running", "switching", "external"];

/**
 * Follow the deployed version and the online upgrade job on the host.
 *
 * The site is rebuilt during an upgrade, so while a job runs any failed poll (a network error,
 * a gateway error page, or the host agent restarting) means the services are switching over.
 * It is expected, keeps the last known state and is never reported as an error.
 */
export function useUpgradeJob(reload: () => void = reloadPage): {
  phase: UpgradePhase;
  state: SystemVersionState | null;
  error: string;
  /** Polls have kept failing for longer than a service switch should take. */
  switchingTooLong: boolean;
  refresh: () => Promise<void>;
  start: (target: string) => Promise<StartUpgradeResult>;
} {
  const [state, setState] = useState<SystemVersionState | null>(null);
  const [error, setError] = useState("");
  const [switching, setSwitching] = useState(false);
  const [switchingTooLong, setSwitchingTooLong] = useState(false);
  // Counts the times the admin asked by hand; each one restarts the unreachable retries.
  const [retryWindow, setRetryWindow] = useState(0);

  // The latest state for callbacks that outlive a render, and which request answered last.
  const stateRef = useRef<SystemVersionState | null>(null);
  const requestRef = useRef(0);
  // When the polls started failing without an answer in between.
  const switchingSinceRef = useRef<number | null>(null);
  const reloadRef = useRef(reload);
  const reloadedRef = useRef(false);

  useEffect(() => {
    reloadRef.current = reload;
  }, [reload]);

  const accept = useCallback((next: SystemVersionState) => {
    const previous = stateRef.current;
    requestRef.current += 1;
    stateRef.current = next;
    setState(next);
    setSwitching(false);
    switchingSinceRef.current = null;
    setSwitchingTooLong(false);
    setError("");
    // Only a job watched going from running to succeeded means this page holds stale assets.
    if (
      !reloadedRef.current &&
      previous?.job?.status === "running" &&
      next.job?.status === "succeeded"
    ) {
      reloadedRef.current = true;
      reloadRef.current();
    }
  }, []);

  const markSwitching = useCallback(() => {
    const now = Date.now();
    switchingSinceRef.current ??= now;
    setSwitching(true);
    if (now - switchingSinceRef.current >= SWITCHING_WARN_AFTER_MS) setSwitchingTooLong(true);
  }, []);

  const load = useCallback(async () => {
    requestRef.current += 1;
    const request = requestRef.current;
    let next: SystemVersionState;
    try {
      next = await getSystemVersion();
    } catch (caught) {
      if (request !== requestRef.current) return;
      if (isBusy(stateRef.current)) {
        markSwitching();
      } else {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
      return;
    }
    if (request !== requestRef.current) return;
    if (next.agent === "unreachable" && isBusy(stateRef.current)) {
      // The host agent restarts itself after an upgrade, so it may vanish for a moment.
      markSwitching();
      return;
    }
    accept(next);
  }, [accept, markSwitching]);

  // Asking by hand also gives an unreachable agent a fresh window of automatic retries.
  const refresh = useCallback(async () => {
    setRetryWindow((count) => count + 1);
    await load();
  }, [load]);

  const start = useCallback(
    async (target: string): Promise<StartUpgradeResult> => {
      const result = await startSystemUpgrade(target);
      if (result.kind === "started") {
        const current = stateRef.current;
        accept({
          agent: "ok",
          version: current?.version ?? null,
          job: result.job,
          log: "",
          externalBusy: false,
        });
      } else if (result.kind === "busy") {
        await load();
      }
      return result;
    },
    [accept, load],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const phase = derivePhase(state, error, switching);
  const polling = POLLING_PHASES.includes(phase);
  // Not a job in progress: the agent could not be reached on load, or while it restarts itself.
  const reconnecting = phase === "unreachable";

  useEffect(() => {
    if (!polling) return undefined;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      await load();
      if (!cancelled) timer = setTimeout(tick, POLL_INTERVAL_MS);
    };
    timer = setTimeout(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [polling, load]);

  useEffect(() => {
    if (!reconnecting) return undefined;
    const startedAt = Date.now();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      await load();
      if (!cancelled && Date.now() - startedAt < UNREACHABLE_RETRY_MS) {
        timer = setTimeout(tick, POLL_INTERVAL_MS);
      }
    };
    timer = setTimeout(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [reconnecting, retryWindow, load]);

  return {
    phase,
    state,
    error,
    switchingTooLong: phase === "switching" && switchingTooLong,
    refresh,
    start,
  };
}
