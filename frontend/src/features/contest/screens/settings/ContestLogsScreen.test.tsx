import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { EventFeedItem } from "@/core/entities/contest.entity";
import ContestLogsScreen from "./ContestLogsScreen";

vi.mock("react-router-dom", () => ({
  useParams: () => ({ contestId: "contest-1" }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>) =>
      typeof fallback === "string" ? fallback : key,
  }),
}));

vi.mock("@/features/contest/contexts", () => ({
  useContestAdmin: () => ({
    examEvents: [],
    examEventsLoading: false,
    isRefreshing: false,
    refreshAdminData: vi.fn(),
  }),
  useAdminPanelRefresh: () => ({
    registerPanelRefresh: vi.fn(),
  }),
}));

vi.mock("@/features/contest/hooks/useContestAnticheatConfig", () => ({
  useContestAnticheatConfig: () => ({
    loading: false,
    refresh: vi.fn(),
    config: {
      effective: {
        eventFeedAggregationWindowSeconds: 30,
        incidentScreenshotWindowBeforeMs: 3000,
        incidentScreenshotWindowAfterMs: 3000,
        incidentScreenshotPreviewLimit: 3,
        incidentScreenshotCategories: [],
      },
    },
  }),
}));

vi.mock("@/features/contest/components/admin/IncidentCard", () => ({
  default: ({
    incident,
    collapsible,
  }: {
    incident: EventFeedItem;
    collapsible?: boolean;
  }) => (
    <div
      data-collapsible={String(collapsible)}
      data-testid="full-incident-card"
    >
      {incident.eventType}
    </div>
  ),
}));

const eventFeed: EventFeedItem[] = [
  {
    incidentKey: "violation-1",
    eventType: "tab_hidden",
    priority: 1,
    category: "violation",
    penalized: true,
    firstAt: "2026-05-04T09:10:00+08:00",
    lastAt: "2026-05-04T09:10:00+08:00",
    count: 1,
    evidenceCount: 1,
    summary: "left tab",
    source: "exam_event",
    userName: "王小明",
    userId: "1",
    metadata: {},
  },
  {
    incidentKey: "p2-1",
    eventType: "mouse_leave_triggered",
    priority: 2,
    category: "info",
    penalized: false,
    firstAt: "2026-05-04T09:00:00+08:00",
    lastAt: "2026-05-04T09:00:00+08:00",
    count: 1,
    evidenceCount: 0,
    summary: "entered",
    source: "exam_event",
    userName: "陳小華",
    userId: "2",
    metadata: {},
  },
  {
    incidentKey: "exam-1",
    eventType: "exam_entered",
    priority: 3,
    category: "system",
    penalized: false,
    firstAt: "2026-05-04T08:58:00+08:00",
    lastAt: "2026-05-04T08:58:00+08:00",
    count: 1,
    evidenceCount: 0,
    summary: "entered",
    source: "exam_event",
    userName: "陳小華",
    userId: "2",
    metadata: {},
  },
];

describe("ContestLogsScreen", () => {
  it("shows a unified embedded event record list", async () => {
    render(<ContestLogsScreen embedded eventFeed={eventFeed} />);

    expect(screen.queryByRole("tab", { name: "違規事件" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "考試事件" })).not.toBeInTheDocument();
    expect(screen.getByText("事件紀錄")).toBeInTheDocument();
    expect(screen.getByText("tab hidden")).toBeInTheDocument();
    expect(
      screen.getByText("mouse leave triggered"),
    ).toBeInTheDocument();
    expect(screen.getByText("exam entered")).toBeInTheDocument();
    expect(screen.queryByTestId("full-incident-card")).not.toBeInTheDocument();
    expect(screen.getByText("王小明 · 09:10")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /tab hidden/ }));

    expect(
      screen.getByRole("dialog", { name: "tab hidden" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("full-incident-card")).toHaveTextContent(
      "tab_hidden",
    );
    expect(screen.getByTestId("full-incident-card")).toHaveAttribute(
      "data-collapsible",
      "false",
    );
  });
});
