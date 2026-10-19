import { beforeEach, describe, expect, it, vi } from "vitest";

import { EnvelopeError } from "@/infrastructure/api/envelope";
import { httpClient } from "@/infrastructure/api/http.client";
import {
  checkSystemUpdates,
  getIngress,
  getSystemVersion,
  startSystemUpgrade,
  type StartUpgradeResult,
} from "./system.repository";

vi.mock("@/infrastructure/api/http.client", () => ({
  httpClient: { get: vi.fn(), post: vi.fn() },
}));

const LOCAL_ERRORS = { suppressGlobalError: true };
const SHA_OLD = "a".repeat(40);
const SHA_TARGET = "b".repeat(40);
const SHA_LATEST = "c".repeat(40);

const respond = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const ok = (data: unknown, status = 200) => respond(status, { data, meta: {} });
const failure = (status: number, code: string, details: Record<string, unknown> = {}) =>
  respond(status, {
    errors: [{ code, message: code, field: null, details }],
    meta: {},
  });

const jobDto = {
  id: "job-1",
  target: SHA_TARGET,
  triggered_by: "root",
  started_at: "2026-10-17T08:00:00Z",
  finished_at: null,
  status: "running",
  step: "build",
  site_healthy: null,
};
const job = {
  id: "job-1",
  target: SHA_TARGET,
  triggeredBy: "root",
  startedAt: "2026-10-17T08:00:00Z",
  finishedAt: null,
  status: "running",
  step: "build",
  siteHealthy: null,
};

beforeEach(() => {
  vi.mocked(httpClient.get).mockReset();
  vi.mocked(httpClient.post).mockReset();
});

describe("getSystemVersion", () => {
  it("maps the agent payload and keeps API errors local to the page", async () => {
    vi.mocked(httpClient.get).mockResolvedValue(
      ok({
        agent: "ok",
        version: { current: SHA_OLD, previous: null, deployed_at: "2026-10-01T00:00:00Z" },
        job: jobDto,
        log: "building...",
        external_busy: true,
      }),
    );

    const state = await getSystemVersion();

    expect(httpClient.get).toHaveBeenCalledWith("/api/v1/system/version", LOCAL_ERRORS);
    expect(state).toEqual({
      agent: "ok",
      version: { current: SHA_OLD, previous: null, deployedAt: "2026-10-01T00:00:00Z" },
      job,
      log: "building...",
      externalBusy: true,
    });
  });

  it.each(["unsupported", "unreachable"] as const)(
    "falls back to empty fields when the agent is %s",
    async (agent) => {
      vi.mocked(httpClient.get).mockResolvedValue(ok({ agent, detail: "no agent here" }));

      expect(await getSystemVersion()).toEqual({
        agent,
        version: null,
        job: null,
        log: "",
        externalBusy: false,
      });
    },
  );

  it("keeps a missing job as null when the agent is ok", async () => {
    vi.mocked(httpClient.get).mockResolvedValue(
      ok({
        agent: "ok",
        version: { current: SHA_OLD, previous: SHA_TARGET, deployed_at: null },
        job: null,
        log: "",
        external_busy: false,
      }),
    );

    const state = await getSystemVersion();

    expect(state.job).toBeNull();
    expect(state.version).toEqual({ current: SHA_OLD, previous: SHA_TARGET, deployedAt: null });
  });
});

describe("checkSystemUpdates", () => {
  it("preserves the tracked branch reported by the agent", async () => {
    vi.mocked(httpClient.get).mockResolvedValue(ok({ agent: "ok", tracked_branch: "dev" }));
    expect((await getSystemVersion()).trackedBranch).toBe("dev");
    vi.mocked(httpClient.post).mockResolvedValue(ok({
      tracked_branch: "dev", latest: { sha: SHA_LATEST, subject: "staging", committed_at: "now" },
      releases: [], update_available: false,
    }));
    expect((await checkSystemUpdates()).trackedBranch).toBe("dev");
  });

  it("maps the release check", async () => {
    vi.mocked(httpClient.post).mockResolvedValue(
      ok({
        latest: { sha: SHA_LATEST, subject: "feat: newest", committed_at: "2026-10-16T10:00:00Z" },
        releases: [{ sha: SHA_LATEST, subject: "feat: newest" }],
        update_available: true,
      }),
    );

    const check = await checkSystemUpdates();

    expect(httpClient.post).toHaveBeenCalledWith(
      "/api/v1/system/version/check",
      undefined,
      LOCAL_ERRORS,
    );
    expect(check).toEqual({
      latest: { sha: SHA_LATEST, subject: "feat: newest", committedAt: "2026-10-16T10:00:00Z" },
      releases: [{ sha: SHA_LATEST, subject: "feat: newest" }],
      updateAvailable: true,
    });
  });

  it("rethrows an unavailable agent so the caller can show its state", async () => {
    vi.mocked(httpClient.post).mockResolvedValue(
      failure(503, "agent_unavailable", { agent: "unreachable", detail: "connection refused" }),
    );

    const caught = await checkSystemUpdates().catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(EnvelopeError);
    expect((caught as EnvelopeError).status).toBe(503);
    expect((caught as EnvelopeError).code).toBe("agent_unavailable");
    expect((caught as EnvelopeError).errors[0].details).toEqual({
      agent: "unreachable",
      detail: "connection refused",
    });
  });
});

describe("startSystemUpgrade", () => {
  it("returns the started job from a 202", async () => {
    vi.mocked(httpClient.post).mockResolvedValue(ok(jobDto, 202));

    const result: StartUpgradeResult = await startSystemUpgrade(SHA_TARGET);

    expect(httpClient.post).toHaveBeenCalledWith(
      "/api/v1/system/upgrade",
      { target: SHA_TARGET },
      LOCAL_ERRORS,
    );
    expect(result).toEqual({ kind: "started", job });
  });

  it("maps 409 and 400 responses", async () => {
    vi.mocked(httpClient.post).mockResolvedValueOnce(failure(409, "agent_busy"));
    expect(await startSystemUpgrade(SHA_TARGET)).toEqual({ kind: "busy" });

    vi.mocked(httpClient.post).mockResolvedValueOnce(
      failure(400, "not_latest", { latest: SHA_LATEST }),
    );
    expect(await startSystemUpgrade(SHA_TARGET)).toEqual({ kind: "notLatest", latest: SHA_LATEST });
  });

  it("rethrows any other error", async () => {
    vi.mocked(httpClient.post).mockResolvedValueOnce(
      failure(503, "agent_unavailable", { agent: "unreachable", detail: "down" }),
    );
    await expect(startSystemUpgrade(SHA_TARGET)).rejects.toMatchObject({
      name: "EnvelopeError",
      code: "agent_unavailable",
    });

    vi.mocked(httpClient.post).mockResolvedValueOnce(failure(400, "validation_error"));
    await expect(startSystemUpgrade(SHA_TARGET)).rejects.toMatchObject({
      name: "EnvelopeError",
      code: "validation_error",
    });
  });
});

describe("getIngress", () => {
  const entry = {
    id: "site",
    public: "https://oj.example.test",
    target: "http://127.0.0.1:8080",
    probe: "https://oj.example.test/api/health/",
    ok: true,
    detail: "HTTP 200",
  };

  it("returns the probed entries", async () => {
    vi.mocked(httpClient.get).mockResolvedValue(ok({ agent: "ok", entries: [entry] }));

    expect(await getIngress()).toEqual({ agent: "ok", entries: [entry] });
    expect(httpClient.get).toHaveBeenCalledWith("/api/v1/system/ingress", LOCAL_ERRORS);
  });

  it.each(["unsupported", "unreachable"] as const)(
    "returns no entries when the agent is %s",
    async (agent) => {
      vi.mocked(httpClient.get).mockResolvedValue(ok({ agent, detail: "nothing to probe" }));

      expect(await getIngress()).toEqual({ agent, entries: [] });
    },
  );
});
