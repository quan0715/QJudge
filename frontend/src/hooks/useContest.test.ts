import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useContest } from "./useContest";

// Mock the contest service
vi.mock("@/services/contest", () => ({
  getContest: vi.fn(),
}));

import { getContest } from "@/services/contest";

const mockContest = {
  id: "1",
  name: "Test Contest",
  description: "A test contest",
  startTime: "2024-01-01T10:00:00Z",
  endTime: "2024-01-01T12:00:00Z",
  status: "active",
};

describe("useContest", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should have loading=true initially when contestId is provided", () => {
    vi.mocked(getContest).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    const { result } = renderHook(() => useContest("1"));

    expect(result.current.loading).toBe(true);
    expect(result.current.contest).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("should not fetch when contestId is undefined", () => {
    const { result } = renderHook(() => useContest(undefined));

    expect(result.current.loading).toBe(true);
    expect(result.current.contest).toBeNull();
    expect(getContest).not.toHaveBeenCalled();
  });

  it("should set contest data on successful fetch", async () => {
    vi.mocked(getContest).mockResolvedValue(mockContest as any);

    const { result } = renderHook(() => useContest("1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.contest).toEqual(mockContest);
    expect(result.current.error).toBeNull();
    expect(getContest).toHaveBeenCalledWith("1");
  });

  it("should set error on failed fetch", async () => {
    const mockError = new Error("Failed to fetch contest");
    vi.mocked(getContest).mockRejectedValue(mockError);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { result } = renderHook(() => useContest("1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.contest).toBeNull();
    expect(result.current.error).toEqual(mockError);
  });

  it("should set contest to null when API returns undefined", async () => {
    vi.mocked(getContest).mockResolvedValue(undefined);

    const { result } = renderHook(() => useContest("1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.contest).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("should refetch when contestId changes", async () => {
    const contest1 = { ...mockContest, id: "1", name: "Contest 1" };
    const contest2 = { ...mockContest, id: "2", name: "Contest 2" };

    vi.mocked(getContest)
      .mockResolvedValueOnce(contest1 as any)
      .mockResolvedValueOnce(contest2 as any);

    const { result, rerender } = renderHook(
      ({ contestId }) => useContest(contestId),
      { initialProps: { contestId: "1" } }
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.contest?.name).toBe("Contest 1");

    rerender({ contestId: "2" });

    await waitFor(() => {
      expect(result.current.contest?.name).toBe("Contest 2");
    });

    expect(getContest).toHaveBeenCalledTimes(2);
  });

  it("should provide refresh function that reloads data", async () => {
    vi.mocked(getContest).mockResolvedValue(mockContest as any);

    const { result } = renderHook(() => useContest("1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(getContest).toHaveBeenCalledTimes(1);

    // Call refresh wrapped in act
    await act(async () => {
      await result.current.refresh();
    });

    await waitFor(() => {
      expect(getContest).toHaveBeenCalledTimes(2);
    });
  });
});
