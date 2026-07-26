import { describe, expect, it } from "vitest";

import { mapEventFeedItemDto } from "./contest.participant.mapper";

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
