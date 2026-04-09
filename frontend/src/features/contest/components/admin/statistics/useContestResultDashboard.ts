import { useCallback, useEffect, useRef, useState } from "react";
import type { ContestDetail } from "@/core/entities/contest.entity";
import {
  getExamDashboardQuestionDetail,
  getExamDashboardSummary,
  type ExamDashboardQuestionDetailDto,
  type ExamDashboardSummaryDto,
} from "@/infrastructure/api/repositories/exam.repository";
import type { DashboardMockData, QuestionDetailMock } from "./contestResultDashboard.mock";

interface UseDashboardResult {
  data: DashboardMockData | null;
  loading: boolean;
  error: string | null;
  loadQuestionDetail: (questionId: string) => Promise<void>;
  detailLoadingIds: Record<string, boolean>;
  detailErrors: Record<string, string>;
}

export function useContestResultDashboard(
  contest: ContestDetail | null | undefined,
): UseDashboardResult {
  const [data, setData] = useState<DashboardMockData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailLoadingIds, setDetailLoadingIds] = useState<Record<string, boolean>>({});
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});
  const cancelRef = useRef(false);
  const hydratedContestIdRef = useRef<string | null>(null);
  const inFlightDetailIdsRef = useRef<Set<string>>(new Set());
  const loadedDetailIdsRef = useRef<Set<string>>(new Set());

  const contestId = contest?.id;
  const contestType = contest?.contestType;

  useEffect(() => {
    if (!contestId || !contest) {
      setData(null);
      setLoading(false);
      hydratedContestIdRef.current = null;
      return;
    }
    if (contestType === "coding") {
      setData(null);
      setLoading(false);
      hydratedContestIdRef.current = null;
      return;
    }

    cancelRef.current = false;
    const isSameContest = hydratedContestIdRef.current === contestId;
    setLoading(!isSameContest || data === null);
    setError(null);
    if (!isSameContest) {
      setDetailLoadingIds({});
      setDetailErrors({});
      inFlightDetailIdsRef.current = new Set();
      loadedDetailIdsRef.current = new Set();
    }

    void (async () => {
      try {
        const summary = await getExamDashboardSummary(contestId);
        if (cancelRef.current) return;
        setData(mapDashboardSummary(summary));
        hydratedContestIdRef.current = contestId;
        setLoading(false);
      } catch (err) {
        if (cancelRef.current) return;
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
        setLoading(false);
      }
    })();

    return () => {
      cancelRef.current = true;
    };
  }, [contestId, contestType]);

  const loadQuestionDetail = useCallback(async (questionId: string) => {
    if (!contestId) return;
    if (loadedDetailIdsRef.current.has(questionId)) return;
    if (inFlightDetailIdsRef.current.has(questionId)) return;

    inFlightDetailIdsRef.current.add(questionId);
    setDetailLoadingIds((previous) => ({ ...previous, [questionId]: true }));
    setDetailErrors((previous) => {
      const next = { ...previous };
      delete next[questionId];
      return next;
    });
    try {
      const detail = await getExamDashboardQuestionDetail(contestId, questionId);
      loadedDetailIdsRef.current.add(questionId);
      setData((previous) => {
        if (!previous) return previous;
        return {
          ...previous,
          details: {
            ...previous.details,
            [questionId]: mapQuestionDetail(detail),
          },
        };
      });
    } catch (err) {
      setDetailErrors((previous) => ({
        ...previous,
        [questionId]:
          err instanceof Error ? err.message : "Failed to load question detail",
      }));
    } finally {
      inFlightDetailIdsRef.current.delete(questionId);
      setDetailLoadingIds((previous) => {
        const next = { ...previous };
        delete next[questionId];
        return next;
      });
    }
  }, [contestId]);

  return { data, loading, error, loadQuestionDetail, detailLoadingIds, detailErrors };
}

function mapDashboardSummary(dto: ExamDashboardSummaryDto): DashboardMockData {
  return {
    contest: {
      id: dto.contest.id,
      name: dto.contest.name,
      course: dto.contest.course,
      contestType: dto.contest.contest_type,
      participantCount: dto.contest.participant_count,
      completedCount: dto.contest.completed_count,
      resultsPublished: dto.contest.results_published,
    },
    summary: {
      averageScore: dto.summary.average_score,
      medianScore: dto.summary.median_score,
      maxTotalScore: dto.summary.max_total_score,
    },
    scoreDistribution: dto.score_distribution.map((bucket) => ({
      rangeLabel: bucket.range_label,
      count: bucket.count,
    })),
    questions: dto.questions.map((question) => ({
      questionId: question.question_id,
      order: question.order,
      title: question.title,
      kind: question.kind as DashboardMockData["questions"][number]["kind"],
      maxScore: question.max_score,
      answerCount: question.answer_count,
      missingCount: question.missing_count,
      averageScore: question.average_score,
      scoreRate: question.score_rate,
      zeroRate: question.zero_rate,
      fullRate: question.full_rate,
      status: question.status,
      objectiveStats: question.objective_stats
        ? { correctRate: question.objective_stats.correct_rate }
        : undefined,
      subjectiveStats: question.subjective_stats
        ? {
            gradedCount: question.subjective_stats.graded_count,
            pendingCount: question.subjective_stats.pending_count,
            gradingRate: question.subjective_stats.grading_rate,
          }
        : undefined,
    })),
    details: {},
  };
}

function mapQuestionDetail(dto: ExamDashboardQuestionDetailDto): QuestionDetailMock {
  if (
    dto.kind === "single_choice" ||
    dto.kind === "multiple_choice" ||
    dto.kind === "true_false"
  ) {
    return {
      questionId: dto.question_id,
      kind: dto.kind,
      scoreBands: dto.score_bands,
      responses: dto.responses.map((response) => ({
        participantId: response.participant_id,
        username: response.username,
        nickname: response.nickname,
        displayName: response.display_name,
        score: response.score,
        gradedAt: response.graded_at,
        answer: response.answer,
      })),
      optionDistribution: (dto.option_distribution ?? []).map((item) => ({
        label: item.label,
        count: item.count,
        percent: item.percent,
        isCorrect: item.is_correct,
      })),
      omittedCount: dto.omitted_count ?? 0,
      omittedParticipants: (dto.omitted_participants ?? []).map((item) => ({
        participantId: item.participant_id,
        username: item.username,
        nickname: item.nickname,
        displayName: item.display_name,
      })),
    };
  }

  return {
    questionId: dto.question_id,
    kind: dto.kind as "short_answer" | "essay",
    scoreBands: dto.score_bands,
    responses: dto.responses.map((response) => ({
      participantId: response.participant_id,
      username: response.username,
      nickname: response.nickname,
      displayName: response.display_name,
      score: response.score,
      gradedAt: response.graded_at,
      answer: response.answer,
    })),
    gradingProgress: {
      graded: dto.grading_progress?.graded ?? 0,
      total: dto.grading_progress?.total ?? 0,
    },
  };
}
