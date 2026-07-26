import { describe, expect, it } from "vitest";

import type {
  ExamIntegrityBatch,
  ExamIntegrityRecord,
  ExamIntegrityStateSnapshot,
} from "./examIntegrity.entity";
import type { ExamIntegrityOutbox } from "@/core/ports/examIntegrity.repository";

const snapshot: ExamIntegrityStateSnapshot = {
  pageVisible: true,
  online: false,
  fullscreen: true,
  screenCapture: "active",
  webcamCapture: "disabled",
  health: {
    displayApi: { status: "healthy" },
    evidenceSources: {
      screen_share: { status: "active" },
      webcam: { status: "disabled" },
    },
    evidenceBuffer: {
      screen_share: { status: "healthy" },
      webcam: { status: "disabled" },
    },
  },
  activeSourceDescriptors: [],
};

const record: ExamIntegrityRecord = {
  eventId: "11111111-1111-1111-1111-111111111111",
  seq: 8,
  kind: "health_snapshot",
  eventType: "health_snapshot",
  eventSchemaVersion: 1,
  clientOccurredAtMs: 1_785_000_000_000,
  clientRecordedAtMs: 1_785_000_000_010,
  monotonicMs: 82_100,
  payload: snapshot,
  evidenceDescriptors: [],
};

const batch: ExamIntegrityBatch = {
  schemaVersion: 1,
  batchId: "22222222-2222-2222-2222-222222222222",
  runId: "33333333-3333-3333-3333-333333333333",
  participantId: 44,
  deviceId: "device-a",
  registryVersion: "2026-07-21.1",
  firstSeq: 8,
  lastSeq: 8,
  records: [record],
  clientBuild: "frontend-test",
};

const ackThrough = (outbox: ExamIntegrityOutbox): Promise<void> =>
  outbox.ackThrough(batch.runId, batch.deviceId, batch.lastSeq);

describe("exam integrity core contracts", () => {
  it("keeps records and batches serializable at the core boundary", () => {
    expect(JSON.parse(JSON.stringify(batch))).toEqual({
      schemaVersion: 1,
      batchId: "22222222-2222-2222-2222-222222222222",
      runId: "33333333-3333-3333-3333-333333333333",
      participantId: 44,
      deviceId: "device-a",
      registryVersion: "2026-07-21.1",
      firstSeq: 8,
      lastSeq: 8,
      records: [record],
      clientBuild: "frontend-test",
    });
    expect(ackThrough).toBeTypeOf("function");
  });
});
