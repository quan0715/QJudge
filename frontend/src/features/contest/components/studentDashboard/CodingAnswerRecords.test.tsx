import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import CodingAnswerRecords from "./CodingAnswerRecords";
import { getSubmissions } from "@/infrastructure/api/repositories/submission.repository";

vi.mock("@/features/auth/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "teacher" } }) }));
vi.mock("@/infrastructure/api/repositories/submission.repository", () => ({
  getSubmissions: vi.fn().mockResolvedValue({ count: 3, results: ["AC", "WA", "CE"].map((status, i) => ({
    id: String(i + 1), status, language: "cpp", score: status === "AC" ? 100 : 0,
    execTime: 12, createdAt: "2026-05-01T10:00:00Z",
  })) }), getSubmission: vi.fn(),
}));

describe("shared coding answer records", () => {
  beforeEach(() => vi.clearAllMocks());
  it("fetches only expanded problems for the selected student and keeps all verdicts", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter>
      <CodingAnswerRecords contestId="contest-1" userId="468" problems={[
        { id: "binding-1", problemId: "coding-21", label: "A", title: "A+B", userScore: 100, maxScore: 100, userStatus: "AC", submissionCount: 3 },
        { id: "binding-2", problemId: "coding-22", label: "B", title: "Hello", submissionCount: 0 },
      ]} />
    </MemoryRouter></QueryClientProvider>);
    expect(getSubmissions).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /A\. A\+B/ }));
    await waitFor(() => expect(getSubmissions).toHaveBeenCalledOnce(), { timeout: 10000 });
    expect(getSubmissions).toHaveBeenCalledWith(expect.objectContaining({
      contest: "contest-1", user: "468", problem: "coding-21", include_all: "true",
    }));
    expect(await screen.findByText("WA")).toBeInTheDocument();
    expect(screen.getByText("CE")).toBeInTheDocument();
  });

  it("opens the selected problem and defaults to the authenticated student when no user is supplied", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter>
      <CodingAnswerRecords contestId="contest-1" initialExpandedProblemId="coding-22" problems={[
        { id: "binding-1", problemId: "coding-21", label: "A", title: "A+B" },
        { id: "binding-2", problemId: "coding-22", label: "B", title: "Hello" },
      ]} />
    </MemoryRouter></QueryClientProvider>);
    await waitFor(() => expect(getSubmissions).toHaveBeenCalledOnce(), { timeout: 10000 });
    expect(getSubmissions).toHaveBeenCalledWith(expect.objectContaining({
      contest: "contest-1", user: "teacher", problem: "coding-22", include_all: "true",
    }));
    expect(screen.getByRole("button", { name: /A\. A\+B/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: /B\. Hello/ })).toHaveAttribute("aria-expanded", "true");
  });
});
