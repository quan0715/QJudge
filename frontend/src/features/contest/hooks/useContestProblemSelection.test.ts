import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useContestProblemSelection } from "./useContestProblemSelection";
import type {
  ContestDetail,
  ContestProblemSummary,
  ScoreboardRow,
} from "@/core/entities/contest.entity";

vi.mock("@/infrastructure/api/repositories", () => ({
  getContestProblem: vi.fn().mockResolvedValue(null),
}));

const makeContestProblem = (
  bindingId: string,
  codingProblemId: string,
  label: string,
): ContestProblemSummary => ({
  id: bindingId, // ContestQuestionBinding.id
  problemId: codingProblemId, // CodingProblem.id — the one submissions API expects
  label,
  title: `Problem ${label}`,
});

const makeContest = (problems: ContestProblemSummary[]): ContestDetail =>
  ({
    id: "contest-uuid",
    problems,
  }) as unknown as ContestDetail;

describe("useContestProblemSelection — ID semantics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exposes selectedCodingProblemId mapped from the selected binding id", async () => {
    const bindingA = "binding-aaa";
    const codingA = "coding-aaa";
    const bindingB = "binding-bbb";
    const codingB = "coding-bbb";

    const contest = makeContest([
      makeContestProblem(bindingA, codingA, "A"),
      makeContestProblem(bindingB, codingB, "B"),
    ]);

    const { result } = renderHook(() =>
      useContestProblemSelection({
        contest,
        myRank: null as ScoreboardRow | null,
        initialProblemId: bindingA,
      }),
    );

    await waitFor(() => {
      expect(result.current.selectedProblemId).toBe(bindingA);
    });
    // The coding-problem id is the value the /submissions filter expects.
    expect(result.current.selectedCodingProblemId).toBe(codingA);
  });

  it("normalizes a coding-problem id in the URL back to the binding id and still resolves the coding-problem id", async () => {
    const bindingA = "binding-aaa";
    const codingA = "coding-aaa";

    const contest = makeContest([makeContestProblem(bindingA, codingA, "A")]);

    const { result } = renderHook(() =>
      useContestProblemSelection({
        contest,
        myRank: null as ScoreboardRow | null,
        initialProblemId: codingA, // legacy URL carrying CodingProblem id
      }),
    );

    await waitFor(() => {
      expect(result.current.selectedProblemId).toBe(bindingA);
    });
    expect(result.current.selectedCodingProblemId).toBe(codingA);
  });

  it("returns null selectedCodingProblemId when no problem is selected", () => {
    const contest = makeContest([]);

    const { result } = renderHook(() =>
      useContestProblemSelection({
        contest,
        myRank: null as ScoreboardRow | null,
      }),
    );

    expect(result.current.selectedProblemId).toBeNull();
    expect(result.current.selectedCodingProblemId).toBeNull();
  });
});
