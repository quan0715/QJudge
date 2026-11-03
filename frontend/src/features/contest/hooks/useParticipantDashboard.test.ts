import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getParticipantDashboard: vi.fn() }));
vi.mock("@/infrastructure/api/repositories", () => ({
  getParticipantDashboard: mocks.getParticipantDashboard,
}));

import useParticipantDashboard from "./useParticipantDashboard";

const dashboardFor = (userId: string) => ({ participant: { userId } });

const setVisibility = (state: DocumentVisibilityState) => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
};

beforeEach(() => {
  mocks.getParticipantDashboard.mockReset().mockImplementation(async (_contestId: string, userId: string) =>
    dashboardFor(userId),
  );
  setVisibility("visible");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useParticipantDashboard", () => {
  it("does not request without a user", () => {
    renderHook(() => useParticipantDashboard("c1", null));
    expect(mocks.getParticipantDashboard).not.toHaveBeenCalled();
  });

  it("loads the selected user's dashboard", async () => {
    const { result } = renderHook(() => useParticipantDashboard("c1", "7"));
    await waitFor(() => expect(result.current.data).toEqual(dashboardFor("7")));
    expect(mocks.getParticipantDashboard).toHaveBeenCalledWith("c1", "7");
  });

  it("clears data from the previous user when the user changes", async () => {
    let resolveSecond: (value: unknown) => void = () => {};
    const { result, rerender } = renderHook(({ userId }) => useParticipantDashboard("c1", userId), {
      initialProps: { userId: "7" },
    });
    await waitFor(() => expect(result.current.data).toEqual(dashboardFor("7")));
    mocks.getParticipantDashboard.mockImplementationOnce(
      () => new Promise((resolve) => { resolveSecond = resolve; }),
    );
    rerender({ userId: "8" });
    await waitFor(() => expect(result.current.data).toBeNull());
    await act(async () => resolveSecond(dashboardFor("8")));
    expect(result.current.data).toEqual(dashboardFor("8"));
  });

  it("ignores a late response for the previously selected user", async () => {
    let resolveFirst: (value: unknown) => void = () => {};
    mocks.getParticipantDashboard.mockImplementationOnce(
      () => new Promise((resolve) => { resolveFirst = resolve; }),
    );
    const { result, rerender } = renderHook(({ userId }) => useParticipantDashboard("c1", userId), {
      initialProps: { userId: "7" },
    });
    rerender({ userId: "8" });
    await waitFor(() => expect(result.current.data).toEqual(dashboardFor("8")));
    await act(async () => resolveFirst(dashboardFor("7")));
    expect(result.current.data).toEqual(dashboardFor("8"));
  });

  it("refetches on the interval only while the page is visible", async () => {
    vi.useFakeTimers();
    renderHook(() => useParticipantDashboard("c1", "7", { refreshIntervalMs: 30000 }));
    await act(async () => { await Promise.resolve(); });
    expect(mocks.getParticipantDashboard).toHaveBeenCalledTimes(1);

    setVisibility("hidden");
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(mocks.getParticipantDashboard).toHaveBeenCalledTimes(1);

    setVisibility("visible");
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(mocks.getParticipantDashboard).toHaveBeenCalledTimes(2);
  });

  it("does not poll without an interval", async () => {
    vi.useFakeTimers();
    renderHook(() => useParticipantDashboard("c1", "7"));
    await act(async () => { await vi.advanceTimersByTimeAsync(120000); });
    expect(mocks.getParticipantDashboard).toHaveBeenCalledTimes(1);
  });
});
