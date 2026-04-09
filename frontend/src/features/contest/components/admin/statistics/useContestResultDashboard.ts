import { useEffect, useState } from "react";
import type { ContestDetail } from "@/core/entities/contest.entity";
import { getContestParticipants } from "@/infrastructure/api/repositories/contestParticipants.repository";
import { getExamQuestions } from "@/infrastructure/api/repositories/examQuestions.repository";
import { getAllExamAnswers } from "@/infrastructure/api/repositories/exam.repository";
import type { DashboardMockData } from "./contestResultDashboard.mock";
import { transformToDashboardData } from "./contestResultDashboard.transform";

interface UseDashboardResult {
  data: DashboardMockData | null;
  loading: boolean;
  error: string | null;
}

export function useContestResultDashboard(
  contest: ContestDetail | null | undefined,
): UseDashboardResult {
  const [data, setData] = useState<DashboardMockData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const contestId = contest?.id;
  const contestType = contest?.contestType;

  useEffect(() => {
    if (!contestId || !contest) {
      setLoading(false);
      return;
    }

    if (contestType === "coding") {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const [participants, examQuestions, examAnswers] = await Promise.all([
          getContestParticipants(contestId),
          getExamQuestions(contestId),
          getAllExamAnswers(contestId),
        ]);

        if (cancelled) return;

        const result = transformToDashboardData({
          contestId,
          contestName: contest.name ?? "",
          courseName: "",
          resultsPublished: contest.resultsPublished ?? false,
          participantCount: participants.length,
          examQuestions,
          examAnswers,
        });

        setData(result);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [contestId, contestType, contest]);

  return { data, loading, error };
}
