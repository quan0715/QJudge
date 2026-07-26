import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import EventIncidentCard from "./EventIncidentCard";

describe("EventIncidentCard", () => {
  it("shows occurrence count and semantic evidence availability", () => {
    render(
      <EventIncidentCard
        incident={{
          incidentKey: "episode:one",
          eventId: "11",
          eventType: "mouse_leave",
          priority: 1,
          category: "violation",
          penalized: true,
          firstAt: "2026-07-26T08:00:00Z",
          lastAt: "2026-07-26T08:00:16Z",
          count: 3,
          hasEvidence: true,
          summary: "",
          source: "exam_event",
          userName: "QStudent",
          metadata: {},
        } as never}
      />,
    );

    expect(screen.getByText("×3")).toBeVisible();
    expect(screen.getByText("有證據")).toBeVisible();
    expect(screen.queryByText(/證據 7|7 片段/)).not.toBeInTheDocument();
  });
});
