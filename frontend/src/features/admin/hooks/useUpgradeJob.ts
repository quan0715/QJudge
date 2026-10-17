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

const reloadPage = () => window.location.reload();

/** An upgrade is under way, started here, by another admin, or by the terminal or CD. */
const isBusy = (state: SystemVersionState | null) =>
  state !== null && (state.job?.status === "running" || state.externalBusy);

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
  refresh: () => Promise<void>;
  start: (target: string) => Promise<StartUpgradeResult>;
} {
  const [state, setState] = useState<SystemVersionState | null>(null);
  const [error, setError] = useState("");
  const [switching, setSwitching] = useState(false);

  // The latest state for callbacks that outlive a render, and which request answered last.
  const stateRef = useRef<SystemVersionState | null>(null);
  const requestRef = useRef(0);
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

  const refresh = useCallback(async () => {
    requestRef.current += 1;
    const request = requestRef.current;
    let next: SystemVersionState;
    try {
      next = await getSystemVersion();
    } catch (caught) {
      if (request !== requestRef.current) return;
      if (isBusy(stateRef.current)) {
        setSwitching(true);
      } else {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
      return;
    }
    if (request !== requestRef.current) return;
    if (next.agent === "unreachable" && isBusy(stateRef.current)) {
      // The host agent restarts itself after an upgrade, so it may vanish for a moment.
      setSwitching(true);
      return;
    }
    accept(next);
  }, [accept]);

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
        await refresh();
      }
      return result;
    },
    [accept, refresh],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const phase = derivePhase(state, error, switching);
  const polling = POLLING_PHASES.includes(phase);

  useEffect(() => {
    if (!polling) return undefined;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      await refresh();
      if (!cancelled) timer = setTimeout(tick, POLL_INTERVAL_MS);
    };
    timer = setTimeout(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [polling, refresh]);

  return { phase, state, error, refresh, start };
}
