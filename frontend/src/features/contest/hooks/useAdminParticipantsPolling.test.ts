import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContestDetail } from "@/core/entities/contest.entity";

const mocks = vi.hoisted(() => ({ refreshParticipants: vi.fn() }));
vi.mock("@/features/contest/contexts", () => ({
  useContestAdmin: () => ({ refreshParticipants: mocks.refreshParticipants }),
}));

import { useAdminParticipantsPolling } from "./useAdminParticipantsPolling";

const NOW = Date.parse("2026-11-03T09:30:00Z");
const contest = (endTime = "2026-11-03T10:00:00Z") =>
  ({ startTime: "2026-11-03T09:00:00Z", endTime }) as ContestDetail;

const setVisibility = (state: DocumentVisibilityState) => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  setVisibility("visible");
  mocks.refreshParticipants.mockReset().mockResolvedValue(undefined);
});

afterEach(() => vi.useRealTimers());

describe("useAdminParticipantsPolling", () => {
  it("polls every 10s inside the exam window while visible", async () => {
    renderHook(() => useAdminParticipantsPolling(contest()));
    await act(async () => { await vi.advanceTimersByTimeAsync(20000); });
    expect(mocks.refreshParticipants).toHaveBeenCalledTimes(2);
  });

  it("skips ticks while the page is hidden", async () => {
    renderHook(() => useAdminParticipantsPolling(contest()));
    setVisibility("hidden");
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(mocks.refreshParticipants).not.toHaveBeenCalled();
  });

  it("stops polling after the exam ends", async () => {
    renderHook(() => useAdminParticipantsPolling(contest("2026-11-03T09:30:15Z")));
    await act(async () => { await vi.advanceTimersByTimeAsync(40000); });
    expect(mocks.refreshParticipants).toHaveBeenCalledTimes(1);
  });

  it("does not poll outside the exam window", async () => {
    renderHook(() => useAdminParticipantsPolling(contest("2026-11-03T09:10:00Z")));
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(mocks.refreshParticipants).not.toHaveBeenCalled();
  });

  it("refreshes immediately when the tab becomes visible during the exam", async () => {
    renderHook(() => useAdminParticipantsPolling(contest()));
    setVisibility("hidden");
    setVisibility("visible");
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(mocks.refreshParticipants).toHaveBeenCalledTimes(1);
  });

  it("does not overlap requests", async () => {
    let resolve: () => void = () => {};
    mocks.refreshParticipants.mockImplementation(() => new Promise<void>((r) => { resolve = r; }));
    renderHook(() => useAdminParticipantsPolling(contest()));
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(mocks.refreshParticipants).toHaveBeenCalledTimes(1);
    await act(async () => { resolve(); await vi.advanceTimersByTimeAsync(10000); });
    expect(mocks.refreshParticipants).toHaveBeenCalledTimes(2);
  });
});
