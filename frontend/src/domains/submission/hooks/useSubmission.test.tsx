import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SubmissionProvider, useSubmission } from "./useSubmission";

// Mock services
vi.mock("@/services/submission", () => ({
  getSubmission: vi.fn(),
  getSubmissions: vi.fn(),
}));

// Mock react-router-dom
vi.mock("react-router-dom", () => ({
  useParams: vi.fn(() => ({})),
  useSearchParams: vi.fn(() => [new URLSearchParams(), vi.fn()]),
}));

import { getSubmission, getSubmissions } from "@/services/submission";

// Test data
const mockSubmission = {
  id: "1",
  status: "AC",
  username: "testuser",
  language: "python",
  code: 'print("Hello")',
  execTime: 100,
  memoryUsage: 1024,
  testResults: [{ status: "AC", time: 50, memory: 512 }],
};

const mockSubmissions = [
  { id: "1", status: "AC", username: "user1" },
  { id: "2", status: "WA", username: "user2" },
];

// Helper wrapper
const createWrapper = (
  props: Partial<React.ComponentProps<typeof SubmissionProvider>> = {}
) => {
  return ({ children }: { children: React.ReactNode }) => (
    <SubmissionProvider {...props}>{children}</SubmissionProvider>
  );
};

describe("useSubmission", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("useSubmission hook", () => {
    it("should throw error when used outside SubmissionProvider", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      expect(() => {
        renderHook(() => useSubmission());
      }).toThrow("useSubmission must be used within a SubmissionProvider");

      consoleSpy.mockRestore();
    });

    it("should return initial state within provider", () => {
      const { result } = renderHook(() => useSubmission(), {
        wrapper: createWrapper(),
      });

      expect(result.current.submission).toBeNull();
      expect(result.current.submissions).toEqual([]);
      expect(result.current.totalCount).toBe(0);
      expect(result.current.error).toBeNull();
    });

    it("should use initialSubmission and skip fetch", () => {
      const { result } = renderHook(() => useSubmission(), {
        wrapper: createWrapper({ initialSubmission: mockSubmission as any }),
      });

      expect(result.current.submission).toEqual(mockSubmission);
      expect(result.current.loading).toBe(false);
      expect(getSubmission).not.toHaveBeenCalled();
    });

    it("should use initialSubmissions and skip fetch", () => {
      const { result } = renderHook(() => useSubmission(), {
        wrapper: createWrapper({ initialSubmissions: mockSubmissions as any }),
      });

      expect(result.current.submissions).toEqual(mockSubmissions);
      expect(result.current.totalCount).toBe(2);
      expect(result.current.loading).toBe(false);
    });
  });

  describe("fetching single submission", () => {
    it("should fetch submission when submissionId is provided", async () => {
      vi.mocked(getSubmission).mockResolvedValue(mockSubmission as any);

      const { result } = renderHook(() => useSubmission(), {
        wrapper: createWrapper({ submissionId: "1" }),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.submission).toEqual(mockSubmission);
      expect(result.current.error).toBeNull();
      expect(getSubmission).toHaveBeenCalledWith("1");
    });

    it("should set error when fetch fails", async () => {
      vi.mocked(getSubmission).mockRejectedValue(new Error("Not found"));

      const { result } = renderHook(() => useSubmission(), {
        wrapper: createWrapper({ submissionId: "999" }),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.submission).toBeNull();
      expect(result.current.error).toBe("Not found");
    });

    it("should refresh submission when refreshSubmission is called", async () => {
      vi.mocked(getSubmission).mockResolvedValue(mockSubmission as any);

      const { result } = renderHook(() => useSubmission(), {
        wrapper: createWrapper({ submissionId: "1" }),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(getSubmission).toHaveBeenCalledTimes(1);

      await act(async () => {
        await result.current.refreshSubmission();
      });

      expect(getSubmission).toHaveBeenCalledTimes(2);
    });

    it("should use custom onRefresh if provided", async () => {
      const customRefresh = vi.fn().mockResolvedValue(undefined);

      const { result } = renderHook(() => useSubmission(), {
        wrapper: createWrapper({ submissionId: "1", onRefresh: customRefresh }),
      });

      await act(async () => {
        await result.current.refreshSubmission();
      });

      expect(customRefresh).toHaveBeenCalled();
    });
  });

  describe("fetching submissions list", () => {
    it("should fetch submissions when refreshSubmissions is called", async () => {
      vi.mocked(getSubmissions).mockResolvedValue({
        results: mockSubmissions,
        count: 2,
      } as any);

      const { result } = renderHook(() => useSubmission(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.refreshSubmissions();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.submissions).toEqual(mockSubmissions);
      expect(result.current.totalCount).toBe(2);
    });

    it("should pass problemId and contestId to getSubmissions", async () => {
      vi.mocked(getSubmissions).mockResolvedValue({
        results: mockSubmissions,
        count: 2,
      } as any);

      const { result } = renderHook(() => useSubmission(), {
        wrapper: createWrapper({
          problemId: "problem-1",
          contestId: "contest-1",
        }),
      });

      await act(async () => {
        await result.current.refreshSubmissions({ page: 1 });
      });

      expect(getSubmissions).toHaveBeenCalledWith({
        page: 1,
        problem: "problem-1",
        contest: "contest-1",
      });
    });

    it("should pass filter params to getSubmissions", async () => {
      vi.mocked(getSubmissions).mockResolvedValue({
        results: mockSubmissions,
        count: 2,
      } as any);

      const { result } = renderHook(() => useSubmission(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.refreshSubmissions({ status: "AC", page: 2 });
      });

      expect(getSubmissions).toHaveBeenCalledWith({
        status: "AC",
        page: 2,
      });
    });

    it("should set error when submissions fetch fails", async () => {
      vi.mocked(getSubmissions).mockRejectedValue(new Error("Failed to load"));

      const { result } = renderHook(() => useSubmission(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.refreshSubmissions();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.submissions).toEqual([]);
      expect(result.current.error).toBe("Failed to load");
    });
  });
});
