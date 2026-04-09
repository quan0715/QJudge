import { useEffect, useRef, useState } from "react";
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
  const cancelRef = useRef(false);

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

    (async () => {
      try {
        // Phase 1: fast — participants (with scores) + questions
        const [participants, examQuestions] = await Promise.all([
          getContestParticipants(contestId),
          getExamQuestions(contestId),
        ]);
        if (cancelRef.current) return;

        // Filter out admin/teacher — only count students
        const students = participants.filter(
          (p) => !p.accountRole || p.accountRole === "student",
        );
        const studentUserIds = new Set(students.map((p) => p.userId));
        const participantScores = students.map((p) => Number(p.score) || 0);

        const buildData = (answers: ReturnType<typeof getAllExamAnswers> extends Promise<infer T> ? T : never[] | null) =>
          transformToDashboardData({
            contestId,
            contestName: contest.name ?? "",
            courseName: "",
            resultsPublished: contest.resultsPublished ?? false,
            participantScores,
            examQuestions,
            examAnswers: answers,
          });

        // Show KPI + question grid immediately (no per-question detail yet)
        setData(buildData(null));
        setLoading(false);

        // Phase 2: background — load answers for per-question details
        const allAnswers = await getAllExamAnswers(contestId);
        if (cancelRef.current) return;

        // Filter out admin/teacher answers
        const studentAnswers = allAnswers.filter((a) =>
          studentUserIds.has(String(a.participant_user_id)),
        );
        setData(buildData(studentAnswers));
      } catch (err) {
        if (cancelRef.current) return;
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
        setLoading(false);
      }
    })();

    return () => { cancelRef.current = true; };
  }, [contestId, contestType, contest]);

  return { data, loading, error };
}
