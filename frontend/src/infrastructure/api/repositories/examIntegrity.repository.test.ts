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
      kind: "health_snapshot" as const,
      eventType: "health_snapshot",
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
  it.each([undefined, "unknown", "resident-evidence-fence-v1"])("requires explicit fence capability %s before releasing resident media", async (version) => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ acked_through_seq: 8, processed_through_seq: 8,
      pending_commands: [], release_evidence_before_ms: 999000, evidence_fence_version: version }), { status: 200 }));
    const result = await examIntegrityRepository.sendBatch("1", batch, undefined,
      { run_id: batch.runId, participant_id: 44, device_id: "device-a", attempt_id: "trusted" });
    expect(result.releaseEvidenceBeforeMs).toBe(version === "resident-evidence-fence-v1" ? 999000 : 0);
  });
  it("keeps resident evidence authentication failures local without refresh or replay", async () => {
    const controller = new AbortController();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: "scope expired" }), { status: 401 }));
    await expect(examIntegrityRepository.submitEvidenceCheckpoint("contest-a", {
      uploadScope: { run_id: batch.runId, participant_id: 44, device_id: "device-a", attempt_id: "trusted-attempt" },
      manifests: [], completions: [], unavailable: [],
    }, controller.signal)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]?.signal).toBe(controller.signal);
  });
  it.each([0, 19])("accepts resident stream ACK %i and sends the trusted scope", async (cursor) => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      acked_through_seq: cursor, processed_through_seq: 0,
      pending_commands: [], release_evidence_before_ms: 0, upload_status: "pending",
    }), { status: 200 }));
    const scope = { run_id: batch.runId, participant_id: 44, device_id: "device-a", attempt_id: "trusted-attempt" };
    const ack = await examIntegrityRepository.sendBatch("contest-a", batch, undefined, scope);
    expect(ack.ackedThroughSeq).toBe(cursor);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).upload_scope).toEqual(scope);
  });

  it("sends scope and a zero final marker on an empty control poll", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      acked_through_seq: 0, processed_through_seq: 0,
      pending_commands: [], release_evidence_before_ms: 0, upload_status: "complete",
    }), { status: 200 }));
    const scope = { run_id: batch.runId, participant_id: 44, device_id: "device-a", attempt_id: "trusted-attempt" };
    const result = await examIntegrityRepository.pollUpload("contest-a", scope, 0);
    expect(result.uploadStatus).toBe("complete");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ upload_scope: scope, final_seq: 0 });
  });
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

  it("reads the resident session state without a lifecycle action", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({
        id: "run-1",
        session_state: "active",
        health: "healthy",
        data_state: "open",
        registry_version: "2026-07-26.3",
      }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );

    const run = await examIntegrityRepository.getRun("contest-a", "run-1");

    expect(run.health).toBe("healthy");
    expect(run.sessionState).toBe("active");
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/v1/contests/contest-a/integrity-runs/run-1/",
    );
    expect(fetchMock.mock.calls[0][1].method).toBe("GET");
  });

  it("submits observations through the single checkpoint endpoint", async () => {
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
      "/api/v1/contests/contest-a/exam/integrity/checkpoints/",
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({
      observations: {
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
            kind: "health_snapshot",
            event_type: "health_snapshot",
            event_schema_version: 1,
            client_occurred_at_ms: 1_785_000_000_000,
            client_recorded_at_ms: 1_785_000_000_010,
            monotonic_ms: 82_100,
            payload: { pageVisible: true },
            evidence_descriptors: [],
          },
        ],
        client_build: "frontend-test",
      },
      evidence: {
        manifests: [],
        completions: [],
        unavailable: [],
      },
    });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      credentials: "include",
      redirect: "error",
    });
    const headers = new Headers(fetchMock.mock.calls[0][1].headers);
    expect(headers.get("X-CSRFToken")).toBe("test-csrf-token");
    expect(headers.get("X-Device-Id")).toBeTruthy();
  });

  it("submits all evidence operations through one checkpoint request", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          uploads: [],
          completions: [{ chunk_id: "chunk-a", status: "verified" }],
          unavailable: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const response = await examIntegrityRepository.submitEvidenceCheckpoint("contest-a", {
      manifests: [{
        runId: batch.runId,
        incidentId: "44444444-4444-4444-4444-444444444444",
        chunks: [{
          source: "screen_share",
          recordingSessionId: "session-a",
          chunkSeq: 1,
          isInitChunk: true,
          startAtMs: 1_785_000_000_000,
          endAtMs: 1_785_000_005_000,
          byteSize: 1024,
          codec: "video/webm;codecs=vp8",
          contentType: "video/webm",
          sha256: "a".repeat(64),
          previousSha256: "",
          localDescriptorId: "local-a",
        }],
      }],
      completions: ["chunk-a"],
      unavailable: [{
        runId: batch.runId,
        incidentId: "44444444-4444-4444-4444-444444444444",
        eventId: 17,
        source: "webcam",
        reason: "local_window_empty",
      }],
    });

    expect(response).toEqual({
      uploads: [],
      completions: [{ chunkId: "chunk-a", status: "verified" }],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/v1/contests/contest-a/exam/integrity/checkpoints/",
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({
      evidence: {
        manifests: [{
          run_id: batch.runId,
          incident_id: "44444444-4444-4444-4444-444444444444",
          chunks: [{
            source: "screen_share",
            recording_session_id: "session-a",
            chunk_seq: 1,
            is_init_chunk: true,
            start_at_ms: 1_785_000_000_000,
            end_at_ms: 1_785_000_005_000,
            byte_size: 1024,
            codec: "video/webm;codecs=vp8",
            content_type: "video/webm",
            sha256: "a".repeat(64),
            previous_sha256: "",
            local_descriptor_id: "local-a",
          }],
        }],
        completions: [{ chunk_id: "chunk-a" }],
        unavailable: [{
          run_id: batch.runId,
          incident_id: "44444444-4444-4444-4444-444444444444",
          event_id: 17,
          source: "webcam",
          reason: "local_window_empty",
        }],
      },
    });
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
      "/api/v1/contests/contest-a/exam/integrity/checkpoints/",
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
