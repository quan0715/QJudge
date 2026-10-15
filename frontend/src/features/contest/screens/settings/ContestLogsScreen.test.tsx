import { act, fireEvent, render, screen } from "@testing-library/react";
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
    eventFeed: [],
    examEventsLoading: false,
    isRefreshing: false,
    refreshAdminData: vi.fn(),
  }),
  useAdminPanelRefresh: () => ({
    registerPanelRefresh: vi.fn(),
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
    eventType: "mouse_leave_triggered",
    priority: 1,
    category: "violation",
    penalized: true,
    firstAt: "2026-05-04T09:10:00+08:00",
    lastAt: "2026-05-04T09:10:00+08:00",
    count: 1,
    hasEvidence: true,
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
    hasEvidence: false,
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
    hasEvidence: false,
    summary: "entered",
    source: "exam_event",
    userName: "陳小華",
    userId: "2",
    metadata: {},
  },
];

describe("ContestLogsScreen", () => {
  it("loads more embedded events within the feed scroll container", () => {
    let notify: IntersectionObserverCallback;
    const observe = vi.fn();
    const observer = vi.fn(function (callback: IntersectionObserverCallback, _options?: IntersectionObserverInit) {
      notify = callback;
      return { observe, disconnect: vi.fn() };
    });
    vi.stubGlobal("IntersectionObserver", observer);
    try {
      render(<ContestLogsScreen embedded eventFeed={Array.from({ length: 120 }, (_, index) => ({
        ...eventFeed[0], incidentKey: `event-${index}`,
      }))} />);
      const sentinel = observe.mock.calls[0][0] as HTMLElement;
      expect(observer.mock.calls[0][1]?.root).toBe(sentinel.parentElement);
      expect(screen.getAllByRole("button", { name: /mouse leave triggered/ })).toHaveLength(50);
      act(() => notify([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
      expect(screen.getAllByRole("button", { name: /mouse leave triggered/ })).toHaveLength(100);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("shows a unified embedded event record list", async () => {
    render(<ContestLogsScreen embedded eventFeed={eventFeed} />);

    expect(screen.queryByRole("tab", { name: "違規事件" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "考試事件" })).not.toBeInTheDocument();
    expect(screen.getByText("事件紀錄")).toBeInTheDocument();
    expect(screen.getAllByText("mouse leave triggered")).toHaveLength(2);
    expect(screen.getByText("exam entered")).toBeInTheDocument();
    expect(screen.queryByTestId("full-incident-card")).not.toBeInTheDocument();
    expect(screen.getByText("王小明 · 09:10")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /mouse leave triggered/ })[0]);

    expect(
      screen.getByRole("dialog", { name: "mouse leave triggered" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("full-incident-card")).toHaveTextContent(
      "mouse_leave_triggered",
    );
    expect(screen.getByTestId("full-incident-card")).toHaveAttribute(
      "data-collapsible",
      "false",
    );
  });
});
