import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { examIntegrityRepository } from "./examIntegrity.repository";

const batch = {
  schemaVersion: 1 as const,
  batchId: "22222222-2222-2222-2222-222222222222",
  runId: "33333333-3333-3333-3333-333333333333",
  participantId: 44,
  deviceId: "device-a",
  registryVersion: "2026-07-21.1",
  firstSeq: 8,
  lastSeq: 8,
  records: [
    {
      eventId: "11111111-1111-1111-1111-111111111111",
      seq: 8,
      kind: "state_snapshot" as const,
      eventType: "state_snapshot",
      eventSchemaVersion: 1,
      clientOccurredAtMs: 1_785_000_000_000,
      clientRecordedAtMs: 1_785_000_000_010,
      monotonicMs: 82_100,
      payload: { pageVisible: true },
      evidenceDescriptors: [],
    },
  ],
  clientBuild: "frontend-test",
};

describe("examIntegrityRepository", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    document.cookie = "csrftoken=test-csrf-token";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.cookie = "csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  });

  it("maps one batch request to the exact snake_case gateway payload", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          acked_through_seq: 8,
          pending_commands: [],
          release_evidence_before_ms: 0,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const ack = await examIntegrityRepository.sendBatch("contest-a", batch);

    expect(ack).toEqual({
      ackedThroughSeq: 8,
      pendingCommands: [],
      releaseEvidenceBeforeMs: 0,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/v1/contests/contest-a/exam/integrity/batches/",
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({
      schema_version: 1,
      batch_id: batch.batchId,
      run_id: batch.runId,
      participant_id: 44,
      device_id: "device-a",
      registry_version: "2026-07-21.1",
      first_seq: 8,
      last_seq: 8,
      records: [
        {
          event_id: "11111111-1111-1111-1111-111111111111",
          seq: 8,
          kind: "state_snapshot",
          event_type: "state_snapshot",
          event_schema_version: 1,
          client_occurred_at_ms: 1_785_000_000_000,
          client_recorded_at_ms: 1_785_000_000_010,
          monotonic_ms: 82_100,
          payload: { pageVisible: true },
          evidence_descriptors: [],
        },
      ],
      client_build: "frontend-test",
    });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      credentials: "include",
      redirect: "error",
    });
    const headers = new Headers(fetchMock.mock.calls[0][1].headers);
    expect(headers.get("X-CSRFToken")).toBe("test-csrf-token");
    expect(headers.get("X-Device-Id")).toBeTruthy();
  });

  it("preserves a one-shot typed 401 without an auth refresh or replay", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "expired" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(examIntegrityRepository.sendBatch("contest-a", batch)).rejects.toMatchObject({
      status: 401,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/v1/contests/contest-a/exam/integrity/batches/",
    );
  });

  it("passes cancellation through the one-shot batch request", async () => {
    const controller = new AbortController();
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          acked_through_seq: 8,
          pending_commands: [],
          release_evidence_before_ms: 0,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await examIntegrityRepository.sendBatch("contest-a", batch, controller.signal);

    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
  });

  it("rejects a malformed ACK cursor before it reaches the durable outbox", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          acked_through_seq: 8.5,
          pending_commands: [],
          release_evidence_before_ms: 0,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(examIntegrityRepository.sendBatch("contest-a", batch)).rejects.toThrow(
      "Invalid integrity batch acknowledgement",
    );
  });
});
