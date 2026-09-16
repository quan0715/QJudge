import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  get: vi.fn(),
  requestOnce: vi.fn(),
  requestJson: vi.fn(),
}));

vi.mock("@/infrastructure/api/http.client", () => ({
  httpClient: {
    get: api.get,
    requestOnce: api.requestOnce,
  },
  requestJson: api.requestJson,
}));

import {
  getLiveMonitoringConfig,
  getLiveMonitoringTargets,
  requestLiveMonitoringToken,
} from "./liveMonitoring.repository";

beforeEach(() => {
  api.get.mockReset().mockResolvedValue(new Response());
  api.requestOnce.mockReset().mockResolvedValue(new Response());
  api.requestJson.mockReset();
});

describe("liveMonitoring.repository", () => {
  it("maps the token contract and keeps the trusted upload scope in the request body", async () => {
    api.requestJson.mockResolvedValue({
      server_url: "wss://livekit.test",
      token: "short-lived-token",
      room_name: "qjudge-exam-run",
      identity: "qj-publisher",
      run_id: 42,
      role: "publisher",
      allowed_sources: ["screen_share", "webcam", "microphone"],
      expires_at: "2026-09-16T12:00:00Z",
    });

    const grant = await requestLiveMonitoringToken("contest/1", {
      role: "publisher",
      uploadScope: {
        runId: "run-1",
        participantId: 7,
        attemptId: "attempt-1",
        deviceId: "device-1",
      },
    });

    expect(api.requestOnce).toHaveBeenCalledWith(
      "/api/v1/contests/contest%2F1/exam/live/token/",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          role: "publisher",
          upload_scope: {
            run_id: "run-1",
            participant_id: 7,
            attempt_id: "attempt-1",
            device_id: "device-1",
          },
        }),
      }),
    );
    expect(grant).toEqual({
      serverUrl: "wss://livekit.test",
      token: "short-lived-token",
      roomName: "qjudge-exam-run",
      identity: "qj-publisher",
      runId: "42",
      role: "publisher",
      allowedSources: ["screen_share", "webcam"],
      expiresAt: "2026-09-16T12:00:00Z",
    });
  });

  it("maps config and target snapshots without exposing wire names to core", async () => {
    api.requestJson
      .mockResolvedValueOnce({ enabled: true, configured: true, provider: "livekit" })
      .mockResolvedValueOnce({
        observed_at: "2026-09-16T12:00:00Z",
        stale: false,
        targets: [
          { user_id: 7, identity: "qj-student", sources: ["webcam", "screen_share"] },
          { user_id: 8, identity: "", sources: ["screen_share"] },
        ],
      });

    await expect(getLiveMonitoringConfig("contest-1")).resolves.toEqual({
      enabled: true,
      configured: true,
      provider: "livekit",
    });
    await expect(getLiveMonitoringTargets("contest-1")).resolves.toEqual({
      observedAt: "2026-09-16T12:00:00Z",
      stale: false,
      targets: [{
        userId: "7",
        identity: "qj-student",
        sources: ["webcam", "screen_share"],
      }],
    });
  });
});
