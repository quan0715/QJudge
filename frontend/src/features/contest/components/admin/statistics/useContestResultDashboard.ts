import { useCallback, useEffect, useRef, useState } from "react";
import type { ContestDetail } from "@/core/entities/contest.entity";
import { getContestParticipants } from "@/infrastructure/api/repositories/contestParticipants.repository";
import { getExamQuestions } from "@/infrastructure/api/repositories/examQuestions.repository";
import { getAllExamAnswers, type ExamAnswerDto } from "@/infrastructure/api/repositories/exam.repository";
import type { DashboardMockData } from "./contestResultDashboard.mock";
import { transformToDashboardData } from "./contestResultDashboard.transform";

interface UseDashboardResult {
  data: DashboardMockData | null;
  loading: boolean;
  error: string | null;
  /** Call to load per-question detail (answers). Returns updated data. */
  loadDetails: () => Promise<void>;
  detailsLoaded: boolean;
}

export function useContestResultDashboard(
  contest: ContestDetail | null | undefined,
): UseDashboardResult {
  const [data, setData] = useState<DashboardMockData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailsLoaded, setDetailsLoaded] = useState(false);
  const cancelRef = useRef(false);

  // Cache for rebuild
  const cacheRef = useRef<{
    contestId: string;
    participantScores: number[];
    examQuestions: Parameters<typeof transformToDashboardData>[0]["examQuestions"];
    studentUserIds: Set<string>;
    answers: ExamAnswerDto[] | null;
  } | null>(null);

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

    cancelRef.current = false;
    setLoading(true);
    setError(null);
    setDetailsLoaded(false);
    cacheRef.current = null;

    (async () => {
      try {
        const [participants, examQuestions] = await Promise.all([
          getContestParticipants(contestId),
          getExamQuestions(contestId),
        ]);
        if (cancelRef.current) return;

        const students = participants.filter(
          (p) => !p.accountRole || p.accountRole === "student",
        );
        const studentUserIds = new Set(students.map((p) => p.userId));
        const participantScores = students.map((p) => Number(p.score) || 0);

        cacheRef.current = {
          contestId,
          participantScores,
          examQuestions,
          studentUserIds,
          answers: null,
        };

        const result = transformToDashboardData({
          contestId,
          contestName: contest.name ?? "",
          courseName: "",
          resultsPublished: contest.resultsPublished ?? false,
          participantScores,
          examQuestions,
          examAnswers: null,
        });

        setData(result);
        setLoading(false);
      } catch (err) {
        if (cancelRef.current) return;
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
        setLoading(false);
      }
    })();

    return () => { cancelRef.current = true; };
  }, [contestId, contestType, contest]);

  const loadDetails = useCallback(async () => {
    const cache = cacheRef.current;
    if (!cache || !contest || detailsLoaded) return;

    try {
      const allAnswers = await getAllExamAnswers(cache.contestId);
      const studentAnswers = allAnswers.filter((a) =>
        cache.studentUserIds.has(String(a.participant_user_id)),
      );
      cache.answers = studentAnswers;

      const result = transformToDashboardData({
        contestId: cache.contestId,
        contestName: contest.name ?? "",
        courseName: "",
        resultsPublished: contest.resultsPublished ?? false,
        participantScores: cache.participantScores,
        examQuestions: cache.examQuestions,
        examAnswers: studentAnswers,
      });

      setData(result);
      setDetailsLoaded(true);
    } catch {
      // Silently fail — drawer will show empty
    }
  }, [contest, detailsLoaded]);

  return { data, loading, error, loadDetails, detailsLoaded };
}
