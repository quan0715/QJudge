import { useQuery } from "@tanstack/react-query";
import { getGradingUnit, type GradingUnitProgress } from "@/infrastructure/api/repositories/examAnswers.repository";
import type { GradeDraft } from "./gradingWorkbenchModel";

/** Reuse progress notifications; fetch only the visible unit, without another poller. */
export function useAiGradingDrafts(contestId: string, sessionId: string | null | undefined, unit?: GradingUnitProgress) {
  const query = useQuery({
    queryKey: ["grading-drafts", contestId, sessionId, unit?.unit_id, unit?.run_id, unit?.draft_count, unit?.written_count, unit?.status],
    enabled: Boolean(contestId && sessionId && unit && unit.draft_count > 0),
    queryFn: () => getGradingUnit(contestId, sessionId!, unit!.unit_id),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const scores: Record<string, GradeDraft> = {};
  if (query.data?.run_id === unit?.run_id) {
    for (const grade of query.data?.grades ?? []) scores[grade.exam_answer_id] = { score: grade.score, feedback: grade.feedback };
  }
  return { scores, error: query.error?.message };
}
