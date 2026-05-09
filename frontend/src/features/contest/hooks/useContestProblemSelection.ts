import { useState, useEffect, useCallback, useMemo } from "react";
import type { CodingProblemDetail } from "@/core/entities/problem.entity";
import type { ContestProblemSummary, ContestDetail, ScoreboardRow } from "@/core/entities/contest.entity";
import { getContestProblem } from "@/infrastructure/api/repositories";
import type { ProblemMenuItem } from "@/shared/ui/solver";

interface UseContestProblemSelectionProps {
  contest: ContestDetail | null;
  myRank: ScoreboardRow | null;
  initialProblemId?: string;
}

interface UseContestProblemSelectionReturn {
  // Problem list
  problems: ProblemMenuItem[];

  // Selection
  selectedProblemId: string | null;
  // CodingProblem.id for the currently selected binding — the id expected by
  // cross-feature APIs (e.g. /submissions?problem=), since those filters target
  // CodingProblem, not ContestQuestionBinding.
  selectedCodingProblemId: string | null;
  selectedProblemLabel: string;
  selectProblem: (problemId: string) => void;

  // Loaded problem
  selectedProblem: CodingProblemDetail | null;
  isProblemLoading: boolean;
  error: string | null;
}

/**
 * useContestProblemSelection - Handles problem list and selection for contests
 * 
 * This hook only manages:
 * - Problem list derived from contest
 * - Problem selection state
 * - Loading the selected problem
 * 
 * Solving state (code, execution, etc.) is handled by useProblemSolver
 */
export function useContestProblemSelection({
  contest,
  myRank,
  initialProblemId,
}: UseContestProblemSelectionProps): UseContestProblemSelectionReturn {
  // Problem selection
  const [selectedProblemId, setSelectedProblemId] = useState<string | null>(
    initialProblemId || null
  );
  const [selectedProblem, setSelectedProblem] = useState<CodingProblemDetail | null>(null);
  const [isProblemLoading, setIsProblemLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Transform contest problems to menu items
  const problems: ProblemMenuItem[] = useMemo(() => {
    if (!contest?.problems) return [];
    
    return contest.problems.map((p: ContestProblemSummary) => ({
      id: p.id,
      label: p.label,
      title: p.title,
      isSolved: myRank?.problems?.[p.id]?.status === "AC",
    }));
  }, [contest?.problems, myRank]);

  const resolveContestProblemSelectionId = useCallback(
    (lookupId: string | null | undefined) => {
      if (!lookupId || !contest?.problems) return null;

      const byContestProblemId = contest.problems.find((p) => p.id === lookupId);
      if (byContestProblemId) return byContestProblemId.id;

      const byCodingProblemId = contest.problems.find((p) => p.problemId === lookupId);
      return byCodingProblemId?.id || null;
    },
    [contest?.problems]
  );

  // Get current problem label
  const selectedProblemLabel = useMemo(() => {
    if (!selectedProblemId || !contest?.problems) return "A";
    const problem = contest.problems.find((p) => p.id === selectedProblemId);
    return problem?.label || "A";
  }, [selectedProblemId, contest?.problems]);

  const selectedCodingProblemId = useMemo<string | null>(() => {
    if (!selectedProblemId || !contest?.problems) return null;
    const match = contest.problems.find((p) => p.id === selectedProblemId);
    return match?.problemId ?? null;
  }, [selectedProblemId, contest?.problems]);

  // Load problem when selection changes
  useEffect(() => {
    const selectedContestProblemId = resolveContestProblemSelectionId(selectedProblemId);
    if (!selectedContestProblemId || !contest?.id) return;

    const loadProblem = async () => {
      setIsProblemLoading(true);
      setError(null);

      try {
        const problem = await getContestProblem(contest.id, selectedContestProblemId);
        if (!problem) throw new Error("題目不存在");
        setSelectedProblem(problem);
      } catch (err) {
        console.error("Failed to load problem", err);
        setError(err instanceof Error ? err.message : "載入題目失敗");
        setSelectedProblem(null);
      } finally {
        setIsProblemLoading(false);
      }
    };

    loadProblem();
  }, [selectedProblemId, contest?.id, resolveContestProblemSelectionId]);

  const selectProblem = useCallback((problemId: string) => {
    setSelectedProblemId(problemId);
  }, []);

  // Initialize with first problem
  useEffect(() => {
    if (selectedProblemId && contest?.problems) {
      const normalized = resolveContestProblemSelectionId(selectedProblemId);
      if (normalized && normalized !== selectedProblemId) {
        setSelectedProblemId(normalized);
        return;
      }
    }

    if (!selectedProblemId && problems.length > 0) {
      setSelectedProblemId(problems[0].id);
    }
  }, [contest?.problems, problems, resolveContestProblemSelectionId, selectedProblemId]);

  return {
    problems,
    selectedProblemId,
    selectedCodingProblemId,
    selectedProblemLabel,
    selectProblem,
    selectedProblem,
    isProblemLoading,
    error,
  };
}

export default useContestProblemSelection;
