import { describe, expect, it } from "vitest";

import { mapEventFeedItemDto, mapParticipantDashboardDto } from "./contestParticipant.mapper";

describe("mapEventFeedItemDto", () => {
  it("maps semantic evidence availability without exposing chunk counts", () => {
    const item = mapEventFeedItemDto({
      incident_key: "episode:one",
      event_type: "mouse_leave",
      count: 3,
      has_evidence: true,
      metadata: {
        occurrences: [
          {
            incident_id: "one",
            event_id: "11",
            first_at: "2026-07-26T08:00:00Z",
            last_at: "2026-07-26T08:00:06Z",
            duration_ms: 6_000,
            has_evidence: true,
            transitions: [],
          },
        ],
      },
    } as never);

    expect(item.hasEvidence).toBe(true);
    expect(item.count).toBe(3);
    expect(item.metadata?.occurrences).toHaveLength(1);
    expect(item).not.toHaveProperty("evidenceCount");
  });
});

it("preserves canonical paper labels alongside the original question indexes", () => {
  const dashboard = mapParticipantDashboardDto({
    contest_type: "paper_exam",
    report: {
      overview_rows: [{ question_id: "part-b", index: 7, question_label: "3(b)" }],
      question_details: [{ question_id: "part-b", index: 7, question_label: "3(b)" }],
    },
  });

  if (!("overviewRows" in dashboard.report)) throw new Error("Expected a paper report");
  expect(dashboard.report.overviewRows[0]).toMatchObject({
    questionId: "part-b", index: 7, questionLabel: "3(b)",
  });
  expect(dashboard.report.questionDetails[0]).toMatchObject({
    questionId: "part-b", index: 7, questionLabel: "3(b)",
  });
});
