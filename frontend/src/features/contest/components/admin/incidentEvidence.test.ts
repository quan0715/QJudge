import { describe, expect, it } from "vitest";
import type { EventFeedItem } from "@/core/entities/contest.entity";
import {
  buildIncidentScreenshotQuery,
  getIncidentEvidenceFrameCount,
} from "./incidentEvidence";

const baseIncident: EventFeedItem = {
  incidentKey: "mouse_leave:student-1:2026-05-04T15:48:40.000Z",
  eventId: "event-1",
  eventType: "mouse_leave_continued",
  priority: 1,
  category: "violation",
  penalized: true,
  firstAt: "2026-05-04T15:48:40.000Z",
  lastAt: "2026-05-04T15:57:23.000Z",
  count: 1,
  evidenceCount: 1,
  summary: "mouse_leave_continued",
  source: "exam_event",
  userName: "QStudent",
  userId: "7",
  metadata: {
    upload_session_id: "session-1",
    evidence_cluster_id: "cluster-1",
    module: "screen_share",
  },
};

describe("incidentEvidence", () => {
  it("widens screenshot query for aggregated incidents", () => {
    const params = buildIncidentScreenshotQuery(
      {
        ...baseIncident,
        count: 26,
        evidenceCount: 26,
      },
      { userId: "7" },
    );

    expect(params).toMatchObject({
      user_id: "7",
      limit: 26,
      ts_from: Date.parse(baseIncident.firstAt) - 20_000,
      ts_to: Date.parse(baseIncident.lastAt) + 20_000,
    });
    expect(params.event_id).toBeUndefined();
    expect(params.upload_session_id).toBeUndefined();
    expect(params.evidence_cluster_id).toBeUndefined();
    expect(params.source_module).toBeUndefined();
    expect(params.object_keys).toBeUndefined();
  });

  it("keeps precise screenshot filters for single incidents", () => {
    const params = buildIncidentScreenshotQuery(
      {
        ...baseIncident,
        metadata: {
          ...baseIncident.metadata,
          evidence_window_start: "2026-05-04T15:48:30.000Z",
          evidence_window_end: "2026-05-04T15:48:50.000Z",
          forced_capture_uploaded_object_keys: [
            "contest_1/user_7/session_session-1/screen_share/frame-1.webp",
          ],
        },
      },
      { userId: "7", fallbackLimit: 10 },
    );

    expect(params).toMatchObject({
      user_id: "7",
      event_id: "event-1",
      upload_session_id: "session-1",
      evidence_cluster_id: "cluster-1",
      limit: 1,
      object_keys: [
        "contest_1/user_7/session_session-1/screen_share/frame-1.webp",
      ],
      ts_from: Date.parse("2026-05-04T15:48:30.000Z"),
      ts_to: Date.parse("2026-05-04T15:48:50.000Z"),
    });
  });

  it("derives evidence frame count from metadata before falling back to a boolean", () => {
    expect(
      getIncidentEvidenceFrameCount({
        forced_capture_module_results: {
          screen_share: {
            uploadedObjectKeys: ["screen-1.webp", "screen-2.webp"],
          },
          webcam: {
            uploadedObjectKeys: ["webcam-1.webp"],
          },
        },
        forced_capture_uploaded: true,
      }),
    ).toBe(3);

    expect(
      getIncidentEvidenceFrameCount({
        evidence_uploaded_frame_count: 9,
        forced_capture_uploaded: true,
      }),
    ).toBe(9);

    expect(getIncidentEvidenceFrameCount({ forced_capture_uploaded: true })).toBe(1);
  });
});
