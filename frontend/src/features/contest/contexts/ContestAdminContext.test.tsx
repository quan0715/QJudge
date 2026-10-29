import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContestAdminProvider, useContestAdmin } from "./ContestAdminContext";
import { getContestParticipants, getContestOverviewMetrics, getExamEvents, getContestActivities } from "@/infrastructure/api/repositories";

vi.mock("@/infrastructure/api/repositories", () => ({
  getContestParticipants: vi.fn(), getContestOverviewMetrics: vi.fn(),
  getExamEvents: vi.fn(), getContestActivities: vi.fn(),
}));

function Consumer() {
  const admin = useContestAdmin();
  return <>
    <span>{admin.initialLoading ? "loading" : "ready"}</span>
    <span>{admin.examEventsLoading ? "events-loading" : "events-idle"}</span>
    <span>events: {admin.examEvents.length}</span>
    <button onClick={() => void admin.refreshAllAdminData()}>refresh</button>
  </>;
}
const view = (loadEvents = false, contestId = "c1") => <MemoryRouter>
  <ContestAdminProvider contestId={contestId} loadEvents={loadEvents}><Consumer /></ContestAdminProvider>
</MemoryRouter>;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getContestParticipants).mockResolvedValue([]);
  vi.mocked(getContestOverviewMetrics).mockResolvedValue({} as Awaited<ReturnType<typeof getContestOverviewMetrics>>);
  vi.mocked(getExamEvents).mockResolvedValue({ events: [], eventFeed: [] });
  vi.mocked(getContestActivities).mockResolvedValue([]);
});

describe("admin event demand", () => {
  it("does not load the journal on mount or refresh when the panel does not consume events", async () => {
    render(view());
    await screen.findByText("ready");
    expect(screen.getByText("events-idle")).toBeInTheDocument();
    fireEvent.click(screen.getByText("refresh"));
    await waitFor(() => expect(getContestParticipants).toHaveBeenCalledTimes(2));
    expect(getExamEvents).not.toHaveBeenCalled();
    expect(getContestActivities).not.toHaveBeenCalled();
  });

  it("loads when entering an event-consuming panel and stops event refreshes after leaving", async () => {
    const { rerender } = render(view());
    await screen.findByText("ready");
    rerender(view(true));
    await waitFor(() => expect(getExamEvents).toHaveBeenCalledWith("c1"));
    await screen.findByText("events-idle");
    expect(getContestActivities).toHaveBeenCalledTimes(1);
    rerender(view(false));
    fireEvent.click(screen.getByText("refresh"));
    await waitFor(() => expect(getContestParticipants).toHaveBeenCalledTimes(2));
    expect(getExamEvents).toHaveBeenCalledTimes(1);
  });

  it("loads the selected contest on direct entry and on contest changes", async () => {
    const { rerender } = render(view(true));
    await waitFor(() => expect(getExamEvents).toHaveBeenCalledWith("c1"));
    rerender(view(true, "c2"));
    await waitFor(() => expect(getExamEvents).toHaveBeenCalledWith("c2"));
    expect(getContestActivities).toHaveBeenCalledWith("c2");
  });
});
