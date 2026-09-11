import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi } from "vitest";
import type { ReactNode } from "react";
import { getSubmissions } from "@/infrastructure/api/repositories/submission.repository";
import { useContestSubmissions } from "./useContestSubmissions";

vi.mock("@/infrastructure/api/repositories/submission.repository", () => ({
  getSubmissions: vi.fn().mockResolvedValue({ results: [], count: 0 }),
}));

describe("contest submission history", () => {
  it("requests all dates while preserving student, problem and pagination scope", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useContestSubmissions({
      contestId: "contest-1", userId: "468", problemFilter: "21", page: 2, pageSize: 10,
    }), { wrapper: ({ children }: { children: ReactNode }) =>
      <QueryClientProvider client={client}>{children}</QueryClientProvider> });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getSubmissions).toHaveBeenCalledWith({
      source_type: "contest", contest: "contest-1", include_all: "true",
      user: "468", problem: "21", page: 2, page_size: 10,
    });
  });
});
