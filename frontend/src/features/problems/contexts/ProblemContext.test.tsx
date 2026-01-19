import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ProblemProvider,
  useProblem,
  useProblemStatistics,
  useProblemLeaderboard,
  useProblemSubmissions,
} from "./ProblemContext";

// Mock services
vi.mock("@/infrastructure/api/repositories/problem.repository", () => ({
  getProblem: vi.fn(),
  getProblemStatistics: vi.fn(),
}));

vi.mock("@/infrastructure/api/repositories/submission.repository", () => ({
  getSubmissions: vi.fn(),
}));

// Mock react-router-dom
vi.mock("react-router-dom", () => ({
  useParams: vi.fn(() => ({})),
}));

import { getProblem, getProblemStatistics } from "@/infrastructure/api/repositories/problem.repository";
import { getSubmissions } from "@/infrastructure/api/repositories/submission.repository";

// Test data
const mockProblem = {
  id: "1",
  title: "Test Problem",
  difficulty: "easy",
  submissionCount: 100,
  acceptedCount: 80,
};

const mockStatistics = {
  submissionCount: 100,
  acceptedCount: 80,
  acRate: 80,
  statusCounts: { AC: 80, WA: 15, TLE: 5 },
  trend: [{ date: "2024-01-01", count: 10 }],
};

const mockSubmissions = {
  results: [
    {
      id: "1",
      status: "AC",
      username: "user1",
      execTime: 100,
      language: "python",
    },
    {
      id: "2",
      status: "WA",
      username: "user2",
      execTime: 150,
      language: "cpp",
    },
  ],
  count: 2,
};

// Helper to create wrapper with QueryClient
const createWrapper = (problemId?: string, contestId?: string) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ProblemProvider problemId={problemId} contestId={contestId}>
        {children}
      </ProblemProvider>
    </QueryClientProvider>
  );
};

describe("useProblem", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Reset localStorage mock
    vi.mocked(window.localStorage.getItem).mockReturnValue(null);
  });

  describe("useProblem hook", () => {
    it("should throw error when used outside ProblemProvider", () => {
      // Suppress console.error for this test
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      expect(() => {
        renderHook(() => useProblem());
      }).toThrow("useProblem must be used within a ProblemProvider");

      consoleSpy.mockRestore();
    });

    it("should return initial state within provider", () => {
      vi.mocked(getProblem).mockResolvedValue(undefined);
      vi.mocked(getProblemStatistics).mockResolvedValue(mockStatistics as any);
      vi.mocked(getSubmissions).mockResolvedValue(mockSubmissions as any);

      const { result } = renderHook(() => useProblem(), {
        wrapper: createWrapper("1"),
      });

      expect(result.current.problemLoading).toBe(true);
      expect(result.current.problem).toBeNull();
      expect(result.current.contestId).toBeUndefined();
    });

    it("should load problem data successfully", async () => {
      vi.mocked(getProblem).mockResolvedValue(mockProblem as any);
      vi.mocked(getProblemStatistics).mockResolvedValue(mockStatistics as any);
      vi.mocked(getSubmissions).mockResolvedValue(mockSubmissions as any);

      const { result } = renderHook(() => useProblem(), {
        wrapper: createWrapper("1"),
      });

      await waitFor(() => {
        expect(result.current.problemLoading).toBe(false);
      });

      expect(result.current.problem).toEqual(mockProblem);
      expect(result.current.problemError).toBeNull();
    });

    it("should use initialProblem and skip fetch", async () => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      vi.mocked(getProblemStatistics).mockResolvedValue(mockStatistics as any);
      vi.mocked(getSubmissions).mockResolvedValue(mockSubmissions as any);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          <ProblemProvider problemId="1" initialProblem={mockProblem as any}>
            {children}
          </ProblemProvider>
        </QueryClientProvider>
      );

      const { result } = renderHook(() => useProblem(), { wrapper });

      // Should have initial problem immediately
      expect(result.current.problem).toEqual(mockProblem);
      expect(result.current.problemLoading).toBe(false);

      // getProblem should not be called since we have initialProblem
      expect(getProblem).not.toHaveBeenCalled();
    });

    it("should include contestId in context when provided", async () => {
      vi.mocked(getProblem).mockResolvedValue(mockProblem as any);
      vi.mocked(getProblemStatistics).mockResolvedValue(mockStatistics as any);
      vi.mocked(getSubmissions).mockResolvedValue(mockSubmissions as any);

      const { result } = renderHook(() => useProblem(), {
        wrapper: createWrapper("1", "contest-123"),
      });

      expect(result.current.contestId).toBe("contest-123");
    });
  });

  describe("useProblemStatistics hook", () => {
    it("should return statistics data", async () => {
      vi.mocked(getProblem).mockResolvedValue(mockProblem as any);
      vi.mocked(getProblemStatistics).mockResolvedValue(mockStatistics as any);
      vi.mocked(getSubmissions).mockResolvedValue(mockSubmissions as any);

      const { result } = renderHook(() => useProblemStatistics(), {
        wrapper: createWrapper("1"),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.statistics).toEqual(mockStatistics);
      expect(result.current.error).toBeNull();
    });
  });

  describe("useProblemLeaderboard hook", () => {
    it("should return leaderboard data grouped by user", async () => {
      const acSubmissions = {
        results: [
          {
            id: "1",
            status: "AC",
            username: "user1",
            execTime: 100,
            language: "python",
          },
          {
            id: "2",
            status: "AC",
            username: "user1",
            execTime: 80,
            language: "python",
          }, // faster
          {
            id: "3",
            status: "AC",
            username: "user2",
            execTime: 150,
            language: "cpp",
          },
        ],
        count: 3,
      };

      vi.mocked(getProblem).mockResolvedValue(mockProblem as any);
      vi.mocked(getProblemStatistics).mockResolvedValue(mockStatistics as any);
      vi.mocked(getSubmissions).mockResolvedValue(acSubmissions as any);

      const { result } = renderHook(() => useProblemLeaderboard(), {
        wrapper: createWrapper("1"),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should have 2 users (user1 and user2)
      expect(result.current.leaderboard).toHaveLength(2);
      // user1 should have the faster time (80ms)
      expect(result.current.leaderboard[0].username).toBe("user1");
      expect(result.current.leaderboard[0].execTime).toBe(80);
      expect(result.current.leaderboard[0].rank).toBe(1);
      // user2 should be second
      expect(result.current.leaderboard[1].username).toBe("user2");
      expect(result.current.leaderboard[1].rank).toBe(2);
    });

    it("should return empty array when no AC submissions", async () => {
      vi.mocked(getProblem).mockResolvedValue(mockProblem as any);
      vi.mocked(getProblemStatistics).mockResolvedValue(mockStatistics as any);
      vi.mocked(getSubmissions).mockResolvedValue({
        results: [],
        count: 0,
      } as any);

      const { result } = renderHook(() => useProblemLeaderboard(), {
        wrapper: createWrapper("1"),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.leaderboard).toEqual([]);
    });
  });

  describe("useProblemSubmissions hook", () => {
    it("should return submissions with pagination params", async () => {
      vi.mocked(getProblem).mockResolvedValue(mockProblem as any);
      vi.mocked(getProblemStatistics).mockResolvedValue(mockStatistics as any);
      vi.mocked(getSubmissions).mockResolvedValue(mockSubmissions as any);

      const { result } = renderHook(() => useProblemSubmissions(), {
        wrapper: createWrapper("1"),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.submissions).toEqual(mockSubmissions.results);
      expect(result.current.count).toBe(2);
      expect(result.current.params.page).toBe(1);
      expect(result.current.params.pageSize).toBe(10);
    });

    it("should reset page to 1 when filter changes", async () => {
      vi.mocked(getProblem).mockResolvedValue(mockProblem as any);
      vi.mocked(getProblemStatistics).mockResolvedValue(mockStatistics as any);
      vi.mocked(getSubmissions).mockResolvedValue(mockSubmissions as any);

      const { result } = renderHook(() => useProblemSubmissions(), {
        wrapper: createWrapper("1"),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // First, change to page 2
      act(() => {
        result.current.setParams({ page: 2 });
      });
      expect(result.current.params.page).toBe(2);

      // Then change filter - should reset to page 1
      act(() => {
        result.current.setParams({ statusFilter: "AC" });
      });
      expect(result.current.params.page).toBe(1);
      expect(result.current.params.statusFilter).toBe("AC");
    });
  });
});
