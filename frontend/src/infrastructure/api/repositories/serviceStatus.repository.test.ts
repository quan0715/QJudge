import { beforeEach, describe, expect, it, vi } from "vitest";

import { EnvelopeError } from "@/infrastructure/api/envelope";
import { httpClient } from "@/infrastructure/api/http.client";
import { getServiceStatus } from "./serviceStatus.repository";

vi.mock("@/infrastructure/api/http.client", () => ({
  httpClient: { get: vi.fn() },
}));

const respond = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const dto = {
  generated_at: "2026-10-17T08:00:00Z",
  components: [
    { id: "database", status: "up", detail: "online_judge", latency_ms: 3 },
    { id: "cache", status: "weird", detail: "?", latency_ms: null },
  ],
  integrity: {
    live_run_count: 4,
    unhealthy_run_count: 1,
    stale_heartbeat_count: 2,
    never_reported_count: 3,
    heartbeat_stale_after_seconds: 120,
    unhealthy_runs: [
      {
        id: "run-1",
        contest_id: "contest-1",
        session_state: "active",
        data_state: "open",
        last_error: "boom",
        worker_version: "v1",
        last_worker_heartbeat_at: null,
        updated_at: "2026-10-17T07:59:00Z",
      },
    ],
  },
  containers: {
    agent: "ok",
    items: [
      { project: "qjudge", service: "backend", state: "running", health: "healthy" },
      { project: "qjudge-storage", service: "minio", state: "exited", health: "" },
    ],
  },
};

beforeEach(() => {
  vi.mocked(httpClient.get).mockReset();
});

describe("getServiceStatus", () => {
  it("unwraps the API envelope and maps the whole report", async () => {
    vi.mocked(httpClient.get).mockResolvedValue(respond(200, { data: dto, meta: {} }));

    const report = await getServiceStatus();

    expect(report).toEqual({
      generatedAt: "2026-10-17T08:00:00Z",
      components: [
        { id: "database", status: "up", detail: "online_judge", latencyMs: 3 },
        { id: "cache", status: "unknown", detail: "?", latencyMs: null },
      ],
      integrity: {
        liveRunCount: 4,
        unhealthyRunCount: 1,
        staleHeartbeatCount: 2,
        neverReportedCount: 3,
        heartbeatStaleAfterSeconds: 120,
        unhealthyRuns: [
          {
            id: "run-1",
            contestId: "contest-1",
            sessionState: "active",
            dataState: "open",
            lastError: "boom",
            workerVersion: "v1",
            lastWorkerHeartbeatAt: null,
            updatedAt: "2026-10-17T07:59:00Z",
          },
        ],
      },
      containers: {
        agent: "ok",
        items: [
          { project: "qjudge", service: "backend", state: "running", health: "healthy" },
          { project: "qjudge-storage", service: "minio", state: "exited", health: "" },
        ],
      },
    });
  });

  it("keeps API errors off the global toast because the page shows its own", async () => {
    vi.mocked(httpClient.get).mockResolvedValue(respond(200, { data: dto, meta: {} }));

    await getServiceStatus();

    expect(httpClient.get).toHaveBeenCalledWith("/api/v1/system/service-status", {
      suppressGlobalError: true,
    });
  });

  it.each(["unsupported", "unreachable"] as const)(
    "carries an empty container list when the agent is %s",
    async (agent) => {
      vi.mocked(httpClient.get).mockResolvedValue(
        respond(200, { data: { ...dto, containers: { agent, items: [] } }, meta: {} }),
      );

      expect((await getServiceStatus()).containers).toEqual({ agent, items: [] });
    },
  );

  it("rejects with the envelope error so the page can show its message", async () => {
    vi.mocked(httpClient.get).mockResolvedValue(
      respond(403, {
        errors: [{ code: "permission_denied", message: "Admins only", field: null, details: {} }],
        meta: {},
      }),
    );

    const caught = await getServiceStatus().catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(EnvelopeError);
    expect((caught as EnvelopeError).message).toBe("Admins only");
  });
});
