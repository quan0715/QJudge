/**
 * Data hook for the AI grading screen.
 *
 * Unlike `useGradingData` which loads every answer upfront, this hook lazy-loads
 * answers per question:
 *   - Mount: questions + dashboard summary (cheap, O(题数)).
 *   - On `selectedQuestionId` change: fetch answers for just that question.
 *   - Previously-loaded questions are memoized in an in-memory map.
 *
 * Only supports paper_exam contests; coding contests short-circuit at the
 * screen level before this hook is called.
 */
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import type { ExamQuestion } from "@/core/entities/contest.entity";
import ContestAdminContext from "@/features/contest/contexts/ContestAdminContext";
import {
  getAllExamAnswersForGrading,
  type ExamAnswerGrading,
} from "@/infrastructure/api/repositories/examAnswers.repository";
import { getExamDashboardSummary } from "@/infrastructure/api/repositories/exam.repository";
import { getExamQuestions } from "@/infrastructure/api/repositories/examQuestions.repository";

import { buildGradingRows } from "./buildGradingRows";
import { isSubjectiveType } from "./gradingTypes";
import type {
  GradingAnswerRow,
  QuestionProgress,
  QuestionType,
} from "./gradingTypes";

interface UseAiGradingScreenDataResult {
  /** True while the mount-time fetch (questions + dashboard) is in flight. */
  loading: boolean;
  /** True while the currently-selected question's answers are being fetched. */
  isQuestionLoading: boolean;
  /** Ordered list of questions with progress stats for the left pane. */
  questionProgress: QuestionProgress[];
  /** Per-question answer rows. Only contains questions that have been loaded. */
  answersByQuestion: Map<string, GradingAnswerRow[]>;
  /** Error from the mount-time fetch (questions + dashboard). */
  error?: string;
  /** Error from the selected question's answer fetch, if any. */
  selectedQuestionError?: string;
}

export function useAiGradingScreenData(
  selectedQuestionId: string | null,
): UseAiGradingScreenDataResult {
  const { contestId } = useParams<{ contestId: string }>();
  const contestAdminContext = useContext(ContestAdminContext);

  const participantMap = useMemo(() => {
    const map = new Map<string, { username: string; nickname: string }>();
    for (const p of contestAdminContext?.participants ?? []) {
      map.set(String(p.userId), {
        username: p.username,
        nickname: p.nickname ?? p.displayName ?? p.username,
      });
    }
    return map;
  }, [contestAdminContext?.participants]);

  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [questionStatsById, setQuestionStatsById] = useState<
    Map<string, { answerCount: number; gradedCount: number; averageScore: number }>
  >(new Map());
  const [initialLoading, setInitialLoading] = useState(true);
  const [initialError, setInitialError] = useState<string | undefined>();

  useEffect(() => {
    if (!contestId) {
      setInitialLoading(false);
      return;
    }
    let cancelled = false;
    setInitialLoading(true);
    setInitialError(undefined);
    (async () => {
      try {
        const [qs, dashboard] = await Promise.all([
          getExamQuestions(contestId, { kind: "subjective" }),
          getExamDashboardSummary(contestId, { kind: "subjective" }),
        ]);
        if (cancelled) return;
        const sorted = qs.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        setQuestions(sorted);

        const statsMap = new Map<string, { answerCount: number; gradedCount: number; averageScore: number }>();
        for (const q of dashboard.questions ?? []) {
          const answerCount = q.answer_count ?? 0;
          const gradedCount =
            q.subjective_stats?.graded_count ??
            (q.objective_stats != null ? answerCount : answerCount);
          statsMap.set(q.question_id, {
            answerCount,
            gradedCount,
            averageScore: q.average_score ?? 0,
          });
        }
        setQuestionStatsById(statsMap);
      } catch (err) {
        if (!cancelled) {
          setInitialError(
            err instanceof Error ? err.message : "Failed to load grading metadata",
          );
        }
      } finally {
        if (!cancelled) setInitialLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contestId]);

  // Cache raw slim DTOs per question. Rows are derived below so participantMap
  // / questions loading after the fetch still lands correct student names.
  const [rawAnswersByQuestion, setRawAnswersByQuestion] = useState<
    Map<string, ExamAnswerGrading[]>
  >(new Map());
  const [answerErrors, setAnswerErrors] = useState<Map<string, string>>(new Map());
  const [loadingQuestionIds, setLoadingQuestionIds] = useState<Set<string>>(new Set());
  const inFlightRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!contestId || !selectedQuestionId) return;
    if (rawAnswersByQuestion.has(selectedQuestionId)) return;
    if (inFlightRef.current.has(selectedQuestionId)) return;

    const qid = selectedQuestionId;
    inFlightRef.current.add(qid);
    setLoadingQuestionIds((prev) => {
      const next = new Set(prev);
      next.add(qid);
      return next;
    });
    let cancelled = false;

    (async () => {
      try {
        const { data } = await getAllExamAnswersForGrading(contestId, {
          questionId: qid,
        });
        if (cancelled) return;
        setRawAnswersByQuestion((prev) => {
          const next = new Map(prev);
          next.set(qid, data);
          return next;
        });
      } catch (err) {
        if (cancelled) return;
        setAnswerErrors((prev) => {
          const next = new Map(prev);
          next.set(qid, err instanceof Error ? err.message : "Failed to load answers");
          return next;
        });
      } finally {
        inFlightRef.current.delete(qid);
        if (!cancelled) {
          setLoadingQuestionIds((prev) => {
            const next = new Set(prev);
            next.delete(qid);
            return next;
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [contestId, selectedQuestionId, rawAnswersByQuestion]);

  // Derive rows lazily so participantMap / questions arriving after the fetch
  // still produce correct student names and question info.
  const answersByQuestion = useMemo(() => {
    const map = new Map<string, GradingAnswerRow[]>();
    for (const [qid, raw] of rawAnswersByQuestion.entries()) {
      map.set(qid, buildGradingRows(raw, questions, participantMap));
    }
    return map;
  }, [rawAnswersByQuestion, questions, participantMap]);

  const questionProgress = useMemo<QuestionProgress[]>(() => {
    return questions
      .map((q, idx) => {
        const stats = questionStatsById.get(q.id) ?? {
          answerCount: 0,
          gradedCount: 0,
          averageScore: 0,
        };
        const qType = q.questionType as QuestionType;
        const totalAnswers = stats.answerCount;
        const gradedCount = stats.gradedCount;
        return {
          questionId: q.id,
          questionIndex: (q.order ?? idx) + 1,
          questionType: qType,
          prompt: q.prompt ?? "",
          explanation: q.explanation ?? "",
          correctAnswer: q.correctAnswer,
          averageScore: stats.averageScore,
          maxScore: q.score ?? 0,
          totalAnswers,
          gradedCount,
          progressPercent:
            totalAnswers > 0 ? Math.round((gradedCount / totalAnswers) * 100) : 0,
          isObjective: !isSubjectiveType(qType),
        };
      })
      .sort((a, b) => a.questionIndex - b.questionIndex);
  }, [questions, questionStatsById]);

  const isQuestionLoading =
    selectedQuestionId != null && loadingQuestionIds.has(selectedQuestionId);

  return {
    loading: initialLoading,
    isQuestionLoading,
    questionProgress,
    answersByQuestion,
    error: initialError,
    selectedQuestionError: selectedQuestionId
      ? answerErrors.get(selectedQuestionId)
      : undefined,
  };
}
