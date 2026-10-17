import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  POLL_INTERVAL_MS,
  SWITCHING_WARN_AFTER_MS,
  UNREACHABLE_RETRY_MS,
  useUpgradeJob,
} from "./useUpgradeJob";
import { EnvelopeError } from "@/infrastructure/api/envelope";
import {
  getSystemVersion,
  startSystemUpgrade,
} from "@/infrastructure/api/repositories/system.repository";
import type { SystemVersionState, UpgradeJob } from "@/core/entities/systemVersion.entity";

vi.mock("@/infrastructure/api/repositories/system.repository", () => ({
  getSystemVersion: vi.fn(),
  startSystemUpgrade: vi.fn(),
}));

const CURRENT = "a".repeat(40);
const TARGET = "b".repeat(40);

const job = (overrides: Partial<UpgradeJob> = {}): UpgradeJob => ({
  id: "job-1",
  target: TARGET,
  triggeredBy: "admin",
  startedAt: "2026-10-17T08:00:00Z",
  finishedAt: null,
  status: "running",
  step: "build",
  siteHealthy: null,
  ...overrides,
});

const state = (overrides: Partial<SystemVersionState> = {}): SystemVersionState => ({
  agent: "ok",
  version: { current: CURRENT, previous: null, deployedAt: "2026-10-16T08:00:00Z" },
  job: null,
  log: "",
  externalBusy: false,
  ...overrides,
});

const flush = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

describe("useUpgradeJob", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(getSystemVersion).mockReset();
    vi.mocked(startSystemUpgrade).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("is loading until the first answer, then idle when no job exists", async () => {
    vi.mocked(getSystemVersion).mockResolvedValue(state());

    const { result } = renderHook(() => useUpgradeJob(vi.fn()));
    expect(result.current.phase).toBe("loading");
    expect(result.current.state).toBeNull();

    await flush();

    expect(result.current.phase).toBe("idle");
    expect(result.current.state?.version?.current).toBe(CURRENT);
    expect(result.current.error).toBe("");
  });

  it("is unreachable with an error when the first load fails", async () => {
    vi.mocked(getSystemVersion).mockRejectedValue(new TypeError("Failed to fetch"));

    const { result } = renderHook(() => useUpgradeJob(vi.fn()));
    await flush();

    expect(result.current.phase).toBe("unreachable");
    expect(result.current.error).toBe("Failed to fetch");
    expect(result.current.state).toBeNull();
  });

  it.each(["unsupported", "unreachable"] as const)(
    "takes the %s agent state as its phase without an error",
    async (agent) => {
      vi.mocked(getSystemVersion).mockResolvedValue(state({ agent, version: null }));

      const { result } = renderHook(() => useUpgradeJob(vi.fn()));
      await flush();

      expect(result.current.phase).toBe(agent);
      expect(result.current.error).toBe("");
    },
  );

  it.each([
    ["succeeded", "succeeded"],
    ["failed", "failed"],
    ["interrupted", "interrupted"],
  ] as const)("maps a %s job to the %s phase and stops polling", async (status, phase) => {
    vi.mocked(getSystemVersion).mockResolvedValue(
      state({ job: job({ status, finishedAt: "2026-10-17T08:05:00Z" }) }),
    );

    const { result } = renderHook(() => useUpgradeJob(vi.fn()));
    await flush();
    expect(result.current.phase).toBe(phase);

    await advance(POLL_INTERVAL_MS * 3);
    expect(getSystemVersion).toHaveBeenCalledTimes(1);
  });

  describe("a finished job and a later release", () => {
    const FINISHED_AT = "2026-10-17T08:05:00Z";
    const deployedAt = (at: string) => ({ current: CURRENT, previous: null, deployedAt: at });

    it.each(["succeeded", "failed", "interrupted"] as const)(
      "drops a %s job once a terminal or CD release deployed after it",
      async (status) => {
        vi.mocked(getSystemVersion).mockResolvedValue(
          state({
            version: deployedAt("2026-10-18T02:00:00Z"),
            job: job({ status, step: "migrate", siteHealthy: true, finishedAt: FINISHED_AT }),
          }),
        );

        const { result } = renderHook(() => useUpgradeJob(vi.fn()));
        await flush();

        expect(result.current.phase).toBe("idle");
      },
    );

    it.each([
      ["the same second", FINISHED_AT],
      ["an earlier second", "2026-10-17T08:04:59Z"],
    ])("keeps the result of the job that deployed the version in %s", async (_name, at) => {
      // A successful job writes .version before its finished_at.
      vi.mocked(getSystemVersion).mockResolvedValue(
        state({ version: deployedAt(at), job: job({ status: "succeeded", finishedAt: FINISHED_AT }) }),
      );

      const { result } = renderHook(() => useUpgradeJob(vi.fn()));
      await flush();

      expect(result.current.phase).toBe("succeeded");
    });
  });

  it("does not poll while idle", async () => {
    vi.mocked(getSystemVersion).mockResolvedValue(state());

    renderHook(() => useUpgradeJob(vi.fn()));
    await flush();
    await advance(POLL_INTERVAL_MS * 3);

    expect(getSystemVersion).toHaveBeenCalledTimes(1);
  });

  it("polls a running job every POLL_INTERVAL_MS and follows its steps", async () => {
    vi.mocked(getSystemVersion)
      .mockResolvedValueOnce(state({ job: job({ step: "prepare" }), log: "one" }))
      .mockResolvedValueOnce(state({ job: job({ step: "build" }), log: "one\ntwo" }));

    const { result } = renderHook(() => useUpgradeJob(vi.fn()));
    await flush();
    expect(result.current.phase).toBe("running");
    expect(result.current.state?.job?.step).toBe("prepare");

    await advance(POLL_INTERVAL_MS - 1);
    expect(getSystemVersion).toHaveBeenCalledTimes(1);

    await advance(1);
    expect(getSystemVersion).toHaveBeenCalledTimes(2);
    expect(result.current.state?.job?.step).toBe("build");
    expect(result.current.state?.log).toBe("one\ntwo");
  });

  it("treats failed polls during a running job as switching", async () => {
    vi.mocked(getSystemVersion)
      .mockResolvedValueOnce(state({ job: job({ status: "running", step: "switch" }) }))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { result } = renderHook(() => useUpgradeJob(vi.fn()));
    await flush();
    await advance(POLL_INTERVAL_MS);
    expect(result.current.phase).toBe("switching");
    expect(result.current.error).toBe("");
  });

  it("keeps polling while switching and returns to running once the API answers", async () => {
    vi.mocked(getSystemVersion)
      .mockResolvedValueOnce(state({ job: job({ step: "switch" }) }))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue(state({ job: job({ step: "verify" }) }));

    const { result } = renderHook(() => useUpgradeJob(vi.fn()));
    await flush();
    await advance(POLL_INTERVAL_MS);
    expect(result.current.phase).toBe("switching");
    await advance(POLL_INTERVAL_MS);
    expect(result.current.phase).toBe("switching");
    expect(result.current.error).toBe("");

    await advance(POLL_INTERVAL_MS);
    expect(result.current.phase).toBe("running");
    expect(result.current.state?.job?.step).toBe("verify");
    expect(result.current.error).toBe("");
  });

  it("treats a gateway error page during the switch as switching, not as an error", async () => {
    const badGateway = new EnvelopeError(502, [
      { code: "envelope_malformed", message: "Failed to load system version", field: null, details: {} },
    ]);
    vi.mocked(getSystemVersion)
      .mockResolvedValueOnce(state({ job: job({ step: "switch" }) }))
      .mockRejectedValueOnce(badGateway);

    const { result } = renderHook(() => useUpgradeJob(vi.fn()));
    await flush();
    await advance(POLL_INTERVAL_MS);

    expect(result.current.phase).toBe("switching");
    expect(result.current.error).toBe("");
  });

  it("treats the host agent restarting after the switch as switching", async () => {
    const reload = vi.fn();
    vi.mocked(getSystemVersion)
      .mockResolvedValueOnce(state({ job: job({ step: "verify" }) }))
      .mockResolvedValueOnce(state({ agent: "unreachable", version: null, job: null }))
      .mockResolvedValue(state({ job: job({ status: "succeeded" }) }));

    const { result } = renderHook(() => useUpgradeJob(reload));
    await flush();
    await advance(POLL_INTERVAL_MS);

    expect(result.current.phase).toBe("switching");
    expect(result.current.state?.job?.status).toBe("running");
    expect(result.current.error).toBe("");

    await advance(POLL_INTERVAL_MS);
    expect(result.current.phase).toBe("succeeded");
    expect(reload).toHaveBeenCalledTimes(1);
  });

  describe("switching for too long", () => {
    /** The API answers while `failing` is false, and fails like a dead backend otherwise. */
    const flakyApi = (running = state({ job: job({ step: "switch" }) })) => {
      const api = { failing: false };
      vi.mocked(getSystemVersion).mockImplementation(async () => {
        if (api.failing) throw new TypeError("Failed to fetch");
        return running;
      });
      return api;
    };

    it("warns after ten minutes of failed polls, and keeps polling without an error", async () => {
      const api = flakyApi();
      const { result } = renderHook(() => useUpgradeJob(vi.fn()));
      await flush();
      expect(result.current.switchingTooLong).toBe(false);

      api.failing = true;
      await advance(POLL_INTERVAL_MS);
      expect(result.current.phase).toBe("switching");

      // The last failed poll before the limit still counts as an expected switch.
      await advance(SWITCHING_WARN_AFTER_MS - POLL_INTERVAL_MS);
      expect(result.current.phase).toBe("switching");
      expect(result.current.switchingTooLong).toBe(false);

      await advance(POLL_INTERVAL_MS);
      expect(result.current.phase).toBe("switching");
      expect(result.current.switchingTooLong).toBe(true);
      expect(result.current.error).toBe("");

      const polls = vi.mocked(getSystemVersion).mock.calls.length;
      await advance(POLL_INTERVAL_MS * 2);
      expect(vi.mocked(getSystemVersion).mock.calls.length).toBe(polls + 2);
    });

    it("starts counting again after a poll succeeds", async () => {
      const api = flakyApi();
      const { result } = renderHook(() => useUpgradeJob(vi.fn()));
      await flush();

      api.failing = true;
      await advance(SWITCHING_WARN_AFTER_MS - POLL_INTERVAL_MS * 2);
      expect(result.current.phase).toBe("switching");

      api.failing = false;
      await advance(POLL_INTERVAL_MS);
      expect(result.current.phase).toBe("running");

      // Another stretch just under the limit is a new, short switch, not a long one.
      api.failing = true;
      await advance(SWITCHING_WARN_AFTER_MS - POLL_INTERVAL_MS * 2);
      expect(result.current.phase).toBe("switching");
      expect(result.current.switchingTooLong).toBe(false);

      // The first failed poll of this stretch came one interval after the answer, so the limit
      // is reached three intervals after the point where the stretch above ended.
      await advance(POLL_INTERVAL_MS * 3);
      expect(result.current.switchingTooLong).toBe(true);
    });

    it("clears the warning once the API answers again", async () => {
      const api = flakyApi();
      const { result } = renderHook(() => useUpgradeJob(vi.fn()));
      await flush();

      api.failing = true;
      await advance(SWITCHING_WARN_AFTER_MS + POLL_INTERVAL_MS * 2);
      expect(result.current.switchingTooLong).toBe(true);

      api.failing = false;
      await advance(POLL_INTERVAL_MS);
      expect(result.current.phase).toBe("running");
      expect(result.current.switchingTooLong).toBe(false);
    });

    it("counts the host agent being unreachable as part of the same switch", async () => {
      vi.mocked(getSystemVersion)
        .mockResolvedValueOnce(state({ job: job({ step: "verify" }) }))
        .mockResolvedValue(state({ agent: "unreachable", version: null, job: null }));

      const { result } = renderHook(() => useUpgradeJob(vi.fn()));
      await flush();
      await advance(SWITCHING_WARN_AFTER_MS + POLL_INTERVAL_MS);

      expect(result.current.phase).toBe("switching");
      expect(result.current.switchingTooLong).toBe(true);
    });

    it("is never set outside the switching phase", async () => {
      vi.mocked(getSystemVersion).mockResolvedValue(state());

      const { result } = renderHook(() => useUpgradeJob(vi.fn()));
      await flush();
      await advance(SWITCHING_WARN_AFTER_MS * 2);

      expect(result.current.phase).toBe("idle");
      expect(result.current.switchingTooLong).toBe(false);
    });
  });

  describe("while the host agent is unreachable", () => {
    const unreachable = () => state({ agent: "unreachable", version: null, job: null });
    const polls = () => vi.mocked(getSystemVersion).mock.calls.length;

    it("asks again every POLL_INTERVAL_MS and recovers by itself", async () => {
      vi.mocked(getSystemVersion)
        .mockResolvedValueOnce(unreachable())
        .mockResolvedValueOnce(unreachable())
        .mockResolvedValue(state());

      const { result } = renderHook(() => useUpgradeJob(vi.fn()));
      await flush();
      expect(result.current.phase).toBe("unreachable");

      await advance(POLL_INTERVAL_MS - 1);
      expect(polls()).toBe(1);
      await advance(1);
      expect(polls()).toBe(2);
      expect(result.current.phase).toBe("unreachable");

      await advance(POLL_INTERVAL_MS);
      expect(result.current.phase).toBe("idle");
      expect(result.current.state?.version?.current).toBe(CURRENT);
      expect(result.current.error).toBe("");

      await advance(POLL_INTERVAL_MS * 3);
      expect(polls()).toBe(3);
    });

    it("shows the success state of a reloaded page without reloading again", async () => {
      const reload = vi.fn();
      // The page reloaded after watching the job succeed, while the agent was restarting.
      vi.mocked(getSystemVersion)
        .mockResolvedValueOnce(unreachable())
        .mockResolvedValue(state({ job: job({ status: "succeeded", step: "verify" }) }));

      const { result } = renderHook(() => useUpgradeJob(reload));
      await flush();
      expect(result.current.phase).toBe("unreachable");

      await advance(POLL_INTERVAL_MS);
      expect(result.current.phase).toBe("succeeded");

      await advance(POLL_INTERVAL_MS * 3);
      expect(reload).not.toHaveBeenCalled();
      expect(polls()).toBe(2);
    });

    it("recovers from a failed first load by itself", async () => {
      vi.mocked(getSystemVersion)
        .mockRejectedValueOnce(new TypeError("Failed to fetch"))
        .mockRejectedValueOnce(new TypeError("Failed to fetch"))
        .mockResolvedValue(state());

      const { result } = renderHook(() => useUpgradeJob(vi.fn()));
      await flush();
      expect(result.current.phase).toBe("unreachable");
      expect(result.current.error).toBe("Failed to fetch");

      await advance(POLL_INTERVAL_MS);
      expect(result.current.phase).toBe("unreachable");

      await advance(POLL_INTERVAL_MS);
      expect(result.current.phase).toBe("idle");
      expect(result.current.error).toBe("");
    });

    it.each([
      ["answers unreachable", () => vi.mocked(getSystemVersion).mockResolvedValue(unreachable())],
      [
        "cannot be asked",
        () => vi.mocked(getSystemVersion).mockRejectedValue(new TypeError("Failed to fetch")),
      ],
    ])("stops asking after two minutes when the agent %s", async (_name, arrange) => {
      arrange();

      const { result } = renderHook(() => useUpgradeJob(vi.fn()));
      await flush();
      await advance(UNREACHABLE_RETRY_MS - POLL_INTERVAL_MS);
      const before = polls();
      await advance(POLL_INTERVAL_MS);
      expect(polls()).toBeGreaterThan(before);

      const stopped = polls();
      await advance(UNREACHABLE_RETRY_MS);
      expect(polls()).toBe(stopped);
      expect(result.current.phase).toBe("unreachable");
    });

    it("starts a new two minutes when the admin reconnects by hand", async () => {
      vi.mocked(getSystemVersion).mockResolvedValue(unreachable());

      const { result } = renderHook(() => useUpgradeJob(vi.fn()));
      await flush();
      await advance(UNREACHABLE_RETRY_MS * 2);
      const stopped = polls();

      await act(async () => {
        await result.current.refresh();
      });
      expect(polls()).toBe(stopped + 1);
      expect(result.current.phase).toBe("unreachable");

      await advance(POLL_INTERVAL_MS);
      expect(polls()).toBe(stopped + 2);

      await advance(UNREACHABLE_RETRY_MS * 2);
      const stoppedAgain = polls();
      expect(stoppedAgain).toBeGreaterThan(stopped + 2);
      await advance(UNREACHABLE_RETRY_MS);
      expect(polls()).toBe(stoppedAgain);
    });

    it("does not ask again while the previous request is still pending", async () => {
      let answer: (value: SystemVersionState) => void = () => undefined;
      vi.mocked(getSystemVersion)
        .mockResolvedValueOnce(unreachable())
        .mockReturnValueOnce(new Promise<SystemVersionState>((resolve) => (answer = resolve)))
        .mockResolvedValue(state());

      const { result } = renderHook(() => useUpgradeJob(vi.fn()));
      await flush();
      await advance(POLL_INTERVAL_MS);
      expect(polls()).toBe(2);

      await advance(POLL_INTERVAL_MS * 5);
      expect(polls()).toBe(2);

      answer(unreachable());
      await flush();
      await advance(POLL_INTERVAL_MS);
      expect(polls()).toBe(3);
      expect(result.current.phase).toBe("idle");
    });

    it("never asks about an environment that does not support upgrades", async () => {
      vi.mocked(getSystemVersion).mockResolvedValue(state({ agent: "unsupported", version: null }));

      const { result } = renderHook(() => useUpgradeJob(vi.fn()));
      await flush();
      await advance(UNREACHABLE_RETRY_MS);

      expect(result.current.phase).toBe("unsupported");
      expect(polls()).toBe(1);
    });

    it("stops asking once unmounted", async () => {
      vi.mocked(getSystemVersion).mockResolvedValue(unreachable());

      const { unmount } = renderHook(() => useUpgradeJob(vi.fn()));
      await flush();
      await advance(POLL_INTERVAL_MS);
      expect(polls()).toBe(2);

      unmount();
      await advance(UNREACHABLE_RETRY_MS);

      expect(polls()).toBe(2);
    });

    it("does not schedule another ask when unmounted during a pending request", async () => {
      let answer: (value: SystemVersionState) => void = () => undefined;
      vi.mocked(getSystemVersion)
        .mockResolvedValueOnce(unreachable())
        .mockReturnValueOnce(new Promise<SystemVersionState>((resolve) => (answer = resolve)));

      const { unmount } = renderHook(() => useUpgradeJob(vi.fn()));
      await flush();
      await advance(POLL_INTERVAL_MS);
      expect(polls()).toBe(2);

      unmount();
      answer(unreachable());
      await flush();
      await advance(UNREACHABLE_RETRY_MS);

      expect(polls()).toBe(2);
    });
  });

  it("reloads once after watching the job succeed", async () => {
    const reload = vi.fn();
    vi.mocked(getSystemVersion)
      .mockResolvedValueOnce(state({ job: job({ status: "running" }) }))
      .mockResolvedValue(state({ job: job({ status: "succeeded" }) }));
    renderHook(() => useUpgradeJob(reload));
    await flush();
    await advance(POLL_INTERVAL_MS);
    await advance(POLL_INTERVAL_MS);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload when the page opens on a finished job", async () => {
    const reload = vi.fn();
    vi.mocked(getSystemVersion).mockResolvedValue(state({ job: job({ status: "succeeded" }) }));

    const { result } = renderHook(() => useUpgradeJob(reload));
    await flush();
    await advance(POLL_INTERVAL_MS * 2);

    expect(result.current.phase).toBe("succeeded");
    expect(reload).not.toHaveBeenCalled();
  });

  it("does not reload when a watched job fails", async () => {
    const reload = vi.fn();
    vi.mocked(getSystemVersion)
      .mockResolvedValueOnce(state({ job: job({ status: "running" }) }))
      .mockResolvedValue(state({ job: job({ status: "failed", step: "migrate", siteHealthy: true }) }));

    const { result } = renderHook(() => useUpgradeJob(reload));
    await flush();
    await advance(POLL_INTERVAL_MS);

    expect(result.current.phase).toBe("failed");
    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads the page by default", async () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    vi.mocked(getSystemVersion)
      .mockResolvedValueOnce(state({ job: job({ status: "running" }) }))
      .mockResolvedValue(state({ job: job({ status: "succeeded" }) }));

    renderHook(() => useUpgradeJob());
    await flush();
    await advance(POLL_INTERVAL_MS);

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("polls while another release holds the lock", async () => {
    vi.mocked(getSystemVersion)
      .mockResolvedValueOnce(state({ externalBusy: true }))
      .mockResolvedValueOnce(state({ externalBusy: true }))
      .mockResolvedValue(state({ externalBusy: false }));

    const { result } = renderHook(() => useUpgradeJob(vi.fn()));
    await flush();
    expect(result.current.phase).toBe("external");

    await advance(POLL_INTERVAL_MS);
    expect(getSystemVersion).toHaveBeenCalledTimes(2);
    expect(result.current.phase).toBe("external");

    await advance(POLL_INTERVAL_MS);
    expect(result.current.phase).toBe("idle");
  });

  it("stays external through a failed poll and reports no error", async () => {
    vi.mocked(getSystemVersion)
      .mockResolvedValueOnce(state({ externalBusy: true }))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue(state({ externalBusy: true }));

    const { result } = renderHook(() => useUpgradeJob(vi.fn()));
    await flush();
    await advance(POLL_INTERVAL_MS);

    expect(result.current.phase).toBe("external");
    expect(result.current.error).toBe("");

    await advance(POLL_INTERVAL_MS);
    expect(getSystemVersion).toHaveBeenCalledTimes(3);
  });

  it("stops polling once unmounted", async () => {
    vi.mocked(getSystemVersion).mockResolvedValue(state({ job: job() }));

    const { unmount } = renderHook(() => useUpgradeJob(vi.fn()));
    await flush();
    unmount();
    await advance(POLL_INTERVAL_MS * 3);

    expect(getSystemVersion).toHaveBeenCalledTimes(1);
  });

  describe("refresh", () => {
    it("reloads the state on demand", async () => {
      vi.mocked(getSystemVersion)
        .mockResolvedValueOnce(state())
        .mockResolvedValueOnce(state({ externalBusy: true }));

      const { result } = renderHook(() => useUpgradeJob(vi.fn()));
      await flush();
      await act(async () => {
        await result.current.refresh();
      });

      expect(result.current.phase).toBe("external");
    });

    it("reports a failed refresh without losing the last state", async () => {
      vi.mocked(getSystemVersion)
        .mockResolvedValueOnce(state())
        .mockRejectedValueOnce(new Error("boom"));

      const { result } = renderHook(() => useUpgradeJob(vi.fn()));
      await flush();
      await act(async () => {
        await result.current.refresh();
      });

      expect(result.current.phase).toBe("idle");
      expect(result.current.state?.version?.current).toBe(CURRENT);
      expect(result.current.error).toBe("boom");
    });

    it("recovers from a failed first load", async () => {
      vi.mocked(getSystemVersion)
        .mockRejectedValueOnce(new TypeError("Failed to fetch"))
        .mockResolvedValueOnce(state());

      const { result } = renderHook(() => useUpgradeJob(vi.fn()));
      await flush();
      expect(result.current.phase).toBe("unreachable");

      await act(async () => {
        await result.current.refresh();
      });

      expect(result.current.phase).toBe("idle");
      expect(result.current.error).toBe("");
    });
  });

  describe("start", () => {
    it("shows the started job at once and then polls it", async () => {
      vi.mocked(getSystemVersion)
        .mockResolvedValueOnce(state())
        .mockResolvedValue(state({ job: job({ step: "build" }), log: "building" }));
      vi.mocked(startSystemUpgrade).mockResolvedValue({
        kind: "started",
        job: job({ step: "prepare" }),
      });

      const { result } = renderHook(() => useUpgradeJob(vi.fn()));
      await flush();
      expect(result.current.phase).toBe("idle");

      let outcome: unknown;
      await act(async () => {
        outcome = await result.current.start(TARGET);
      });

      expect(startSystemUpgrade).toHaveBeenCalledWith(TARGET);
      expect(outcome).toMatchObject({ kind: "started" });
      expect(result.current.phase).toBe("running");
      expect(result.current.state?.job?.step).toBe("prepare");
      expect(result.current.state?.version?.current).toBe(CURRENT);

      await advance(POLL_INTERVAL_MS);
      expect(result.current.state?.job?.step).toBe("build");
      expect(result.current.state?.log).toBe("building");
    });

    it("refreshes when another upgrade already holds the lock", async () => {
      vi.mocked(getSystemVersion)
        .mockResolvedValueOnce(state())
        .mockResolvedValueOnce(state({ externalBusy: true }));
      vi.mocked(startSystemUpgrade).mockResolvedValue({ kind: "busy" });

      const { result } = renderHook(() => useUpgradeJob(vi.fn()));
      await flush();

      let outcome: unknown;
      await act(async () => {
        outcome = await result.current.start(TARGET);
      });

      expect(outcome).toEqual({ kind: "busy" });
      expect(getSystemVersion).toHaveBeenCalledTimes(2);
      expect(result.current.phase).toBe("external");
    });

    it("hands a stale target back to the caller and stays idle", async () => {
      vi.mocked(getSystemVersion).mockResolvedValue(state());
      vi.mocked(startSystemUpgrade).mockResolvedValue({
        kind: "notLatest",
        latest: "c".repeat(40),
      });

      const { result } = renderHook(() => useUpgradeJob(vi.fn()));
      await flush();

      let outcome: unknown;
      await act(async () => {
        outcome = await result.current.start(TARGET);
      });

      expect(outcome).toEqual({ kind: "notLatest", latest: "c".repeat(40) });
      expect(result.current.phase).toBe("idle");
      expect(getSystemVersion).toHaveBeenCalledTimes(1);
    });

    it("lets a rejected start reach the caller", async () => {
      vi.mocked(getSystemVersion).mockResolvedValue(state());
      vi.mocked(startSystemUpgrade).mockRejectedValue(new Error("agent exploded"));

      const { result } = renderHook(() => useUpgradeJob(vi.fn()));
      await flush();

      let caught: unknown;
      await act(async () => {
        caught = await result.current.start(TARGET).catch((error: unknown) => error);
      });

      expect(caught).toBeInstanceOf(Error);
      expect(result.current.phase).toBe("idle");
      expect(result.current.error).toBe("");
    });
  });
});
