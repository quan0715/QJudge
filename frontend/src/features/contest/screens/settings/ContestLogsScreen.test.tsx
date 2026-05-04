import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  it("switches embedded event records between violation and exam events", async () => {
    render(<ContestLogsScreen embedded eventFeed={eventFeed} />);

    expect(screen.getByRole("tab", { name: "違規事件" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "考試事件" })).toBeInTheDocument();
    expect(screen.queryByText("事件紀錄")).not.toBeInTheDocument();
    const violationPanel = screen.getByRole("tabpanel");
    expect(within(violationPanel).getByText("tab hidden")).toBeInTheDocument();
    expect(
      within(violationPanel).getByText("滑鼠離開視窗（觸發）"),
    ).toBeInTheDocument();
    expect(
      within(violationPanel).queryByText("exam entered"),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("full-incident-card")).not.toBeInTheDocument();
    expect(screen.getByText("王小明 · 09:10")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /tab hidden/ }));

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

    await userEvent.click(screen.getByRole("tab", { name: "考試事件" }));

    expect(screen.getByRole("tab", { name: "考試事件" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const examPanel = screen.getByRole("tabpanel");
    expect(within(examPanel).getByText("exam entered")).toBeInTheDocument();
    expect(
      within(examPanel).queryByText("滑鼠離開視窗（觸發）"),
    ).not.toBeInTheDocument();
  });
});
