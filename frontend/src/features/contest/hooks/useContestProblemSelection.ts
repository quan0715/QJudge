import { useState, useEffect, useCallback, useMemo } from "react";
import type { ProblemDetail } from "@/core/entities/problem.entity";
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
  selectedProblemLabel: string;
  selectProblem: (problemId: string) => void;
  
  // Loaded problem
  selectedProblem: ProblemDetail | null;
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
  const [selectedProblem, setSelectedProblem] = useState<ProblemDetail | null>(null);
  const [isProblemLoading, setIsProblemLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Transform contest problems to menu items
  const problems: ProblemMenuItem[] = useMemo(() => {
    if (!contest?.problems) return [];
    
    return contest.problems.map((p: ContestProblemSummary) => ({
      id: p.problemId,
      label: p.label,
      title: p.title,
      isSolved: myRank?.problems?.[p.id]?.status === "AC",
    }));
  }, [contest?.problems, myRank]);

  // Get current problem label
  const selectedProblemLabel = useMemo(() => {
    if (!selectedProblemId || !contest?.problems) return "A";
    const problem = contest.problems.find(
      (p) => p.problemId === selectedProblemId
    );
    return problem?.label || "A";
  }, [selectedProblemId, contest?.problems]);

  // Load problem when selection changes
  useEffect(() => {
    if (!selectedProblemId || !contest?.id) return;

    const loadProblem = async () => {
      setIsProblemLoading(true);
      setError(null);

      try {
        const problem = await getContestProblem(contest.id, selectedProblemId);
        if (!problem) throw new Error("題目不存在");
        setSelectedProblem(problem);
      } catch (err: any) {
        console.error("Failed to load problem", err);
        setError(err.message || "載入題目失敗");
        setSelectedProblem(null);
      } finally {
        setIsProblemLoading(false);
      }
    };

    loadProblem();
  }, [selectedProblemId, contest?.id]);

  const selectProblem = useCallback((problemId: string) => {
    setSelectedProblemId(problemId);
  }, []);

  // Initialize with first problem
  useEffect(() => {
    if (!selectedProblemId && problems.length > 0) {
      setSelectedProblemId(problems[0].id);
    }
  }, [problems, selectedProblemId]);

  return {
    problems,
    selectedProblemId,
    selectedProblemLabel,
    selectProblem,
    selectedProblem,
    isProblemLoading,
    error,
  };
}

export default useContestProblemSelection;
