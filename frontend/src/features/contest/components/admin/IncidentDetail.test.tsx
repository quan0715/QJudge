import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import IncidentDetail from "./IncidentDetail";

describe("IncidentDetail", () => {
  it("lists episode occurrences and lets the reviewer select one", () => {
    render(
      <IncidentDetail
        incident={{
          incidentKey: "episode:one",
          eventId: "22",
          eventType: "mouse_leave",
          priority: 1,
          category: "violation",
          penalized: true,
          firstAt: "2026-07-26T08:00:00Z",
          lastAt: "2026-07-26T08:00:16Z",
          count: 2,
          hasEvidence: true,
          summary: "",
          source: "exam_event",
          metadata: {
            occurrences: [
              {
                incident_id: "one",
                event_id: "11",
                first_at: "2026-07-26T08:00:00Z",
                last_at: "2026-07-26T08:00:06Z",
                duration_ms: 6_000,
                has_evidence: true,
              },
              {
                incident_id: "two",
                event_id: "22",
                first_at: "2026-07-26T08:00:10Z",
                last_at: "2026-07-26T08:00:16Z",
                duration_ms: 6_000,
                has_evidence: true,
              },
            ],
          },
        } as never}
      />,
    );

    expect(screen.getByText("事件次序")).toBeVisible();
    const [first, second] = screen.getAllByRole("button");
    expect(first).toHaveAttribute("aria-pressed", "true");
    expect(second).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(second);

    expect(first).toHaveAttribute("aria-pressed", "false");
    expect(second).toHaveAttribute("aria-pressed", "true");
  });
});
