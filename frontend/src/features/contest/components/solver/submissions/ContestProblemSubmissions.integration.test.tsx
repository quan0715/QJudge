/**
 * End-to-end integration test for the contest solver → submissions chain.
 *
 * Simulates what ContestProblemScreen does: runs useContestProblemSelection
 * against a contest with problems that carry distinct binding vs coding-problem
 * UUIDs, pipes the derived selectedCodingProblemId into ContestProblemSubmissions,
 * and asserts that the repository layer ultimately receives CodingProblem.id
 * — not ContestQuestionBinding.id — in the `problem` query param.
 *
 * Regression guard: the hook unit test alone would not catch a future refactor
 * that reverted the prop wiring (e.g. passing selectedProblemId again).
 */
import React from "react";
import { render, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

import { useContestProblemSelection } from "@/features/contest/hooks/useContestProblemSelection";
import ContestProblemSubmissions from "./ContestProblemSubmissions";
import type {
  ContestDetail,
  ContestProblemSummary,
  ScoreboardRow,
} from "@/core/entities/contest.entity";

vi.mock("@/infrastructure/api/repositories", () => ({
  getContestProblem: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/infrastructure/api/repositories/submission.repository", () => ({
  getSubmissions: vi.fn().mockResolvedValue({ results: [], count: 0 }),
}));

import { getSubmissions } from "@/infrastructure/api/repositories/submission.repository";

const CONTEST_ID = "contest-uuid";
const BINDING_ID = "binding-aaa-1111-2222-3333-444444444444";
const CODING_PROBLEM_ID = "coding-aaa-1111-2222-3333-444444444444";

const makeContest = (): ContestDetail =>
  ({
    id: CONTEST_ID,
    problems: [
      {
        id: BINDING_ID,
        problemId: CODING_PROBLEM_ID,
        label: "A",
        title: "Problem A",
      } satisfies ContestProblemSummary,
    ],
  }) as unknown as ContestDetail;

interface WrapperProps {
  contest: ContestDetail;
  initialProblemId: string;
}

function ContestSolverHarness({ contest, initialProblemId }: WrapperProps) {
  const selection = useContestProblemSelection({
    contest,
    myRank: null as ScoreboardRow | null,
    initialProblemId,
  });
  if (!selection.selectedCodingProblemId) return null;
  return (
    <ContestProblemSubmissions
      contestId={contest.id}
      codingProblemId={selection.selectedCodingProblemId}
    />
  );
}

function renderWithProviders(node: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ContestProblemSubmissions integration — coding-problem id wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Component reads currentUser from localStorage; provide one so userId filter
    // also lands in the outgoing params (extra assertion value).
    localStorage.setItem("user", JSON.stringify({ id: 42 }));
  });

  it("forwards CodingProblem.id (not ContestQuestionBinding.id) to the submissions repository", async () => {
    renderWithProviders(
      <ContestSolverHarness
        contest={makeContest()}
        initialProblemId={BINDING_ID}
      />,
    );

    await waitFor(() => {
      expect(getSubmissions).toHaveBeenCalled();
    });

    const call = vi.mocked(getSubmissions).mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call).toBeDefined();
    expect(call.problem).toBe(CODING_PROBLEM_ID);
    expect(call.problem).not.toBe(BINDING_ID);
    expect(call.contest).toBe(CONTEST_ID);
    expect(call.source_type).toBe("contest");
  });

  it("still forwards the right CodingProblem.id when the URL carries the coding id directly", async () => {
    renderWithProviders(
      <ContestSolverHarness
        contest={makeContest()}
        initialProblemId={CODING_PROBLEM_ID}
      />,
    );

    await waitFor(() => {
      expect(getSubmissions).toHaveBeenCalled();
    });

    const call = vi.mocked(getSubmissions).mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call?.problem).toBe(CODING_PROBLEM_ID);
  });
});
