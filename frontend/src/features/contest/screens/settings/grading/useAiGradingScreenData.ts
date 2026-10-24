import { buildPaperQuestionLabels } from "@/features/contest/domain/paperQuestionLabels";
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
import { useCallback, useContext, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { useParams } from "react-router-dom";

import type {
  ExamQuestionType,
} from "@/core/entities/contest.entity";
import ContestAdminContext from "@/features/contest/contexts/ContestAdminContext";
import {
  getAllExamAnswersForGrading,
} from "@/infrastructure/api/repositories/examAnswers.repository";
import { getExamDashboardSummary } from "@/infrastructure/api/repositories/exam.repository";
import { getExamQuestions } from "@/infrastructure/api/repositories/examQuestions.repository";

import { buildGradingRows } from "./buildGradingRows";
import { isSubjectiveType } from "./gradingTypes";
import type {
  GradingAnswerRow,
  QuestionProgress,
} from "./gradingTypes";

interface UseAiGradingScreenDataResult {
  /** True while the mount-time fetch (questions + dashboard) is in flight. */
  loading: boolean;
  /** True while the currently-selected question's answers are being fetched. */
  isQuestionLoading: boolean;
  /** Ordered list of questions with progress stats for the left pane. */
  questionProgress: QuestionProgress[];
  /** Selected question rows; previously fetched questions remain in the query cache. */
  answersByQuestion: Map<string, GradingAnswerRow[]>;
  /** Error from the mount-time fetch (questions + dashboard). */
  error?: string;
  /** Error from the selected question's answer fetch, if any. */
  selectedQuestionError?: string;
  refresh: () => Promise<void>;
}

export function useAiGradingScreenData(
  selectedQuestionId: string | null,
): UseAiGradingScreenDataResult {
  const { contestId } = useParams<{ contestId: string }>();
  const contestAdminContext = useContext(ContestAdminContext);

  const participantMap = useMemo(() => {
    const map = new Map<string, { username: string; displayName: string }>();
    for (const p of contestAdminContext?.participants ?? []) {
      map.set(String(p.userId), {
        username: p.username,
        displayName: p.displayName ?? p.username,
      });
    }
    return map;
  }, [contestAdminContext?.participants]);

  const { user } = useAuth();
  const queryClient = useQueryClient();
  const scope = ["ai-grading", user?.id, contestId] as const;
  const metadata = useQuery({
    queryKey: [...scope, "metadata"],
    enabled: !!user && !!contestId,
    queryFn: async () => {
      const [questions, dashboard] = await Promise.all([
        getExamQuestions(contestId!, { kind: "subjective" }),
        getExamDashboardSummary(contestId!, { kind: "subjective" }),
      ]);
      return { questions: questions.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)), dashboard };
    },
  });
  const answers = useQuery({
    queryKey: [...scope, "answers", selectedQuestionId],
    enabled: !!user && !!contestId && !!selectedQuestionId,
    queryFn: async () => (await getAllExamAnswersForGrading(contestId!, {
      questionId: selectedQuestionId!,
    })).data,
  });
  const questions = useMemo(() => metadata.data?.questions ?? [], [metadata.data]);
  const questionStatsById = useMemo(() => new Map(
    (metadata.data?.dashboard.questions ?? []).map((q) => [q.question_id, {
      answerCount: q.answer_count ?? 0,
      gradedCount: q.subjective_stats?.graded_count ?? q.answer_count ?? 0,
      averageScore: q.average_score ?? 0,
    }]),
  ), [metadata.data]);
  const answersByQuestion = useMemo(() => {
    const map = new Map<string, GradingAnswerRow[]>();
    if (selectedQuestionId && answers.data) {
      map.set(selectedQuestionId, buildGradingRows(answers.data, questions, participantMap));
    }
    return map;
  }, [selectedQuestionId, answers.data, questions, participantMap]);
  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["ai-grading", user?.id, contestId] });
  }, [queryClient, user?.id, contestId]);

  const questionProgress = useMemo<QuestionProgress[]>(() => {
    const labels = buildPaperQuestionLabels(questions);
    return questions
      .map((q, idx) => {
        const stats = questionStatsById.get(q.id) ?? {
          answerCount: 0,
          gradedCount: 0,
          averageScore: 0,
        };
        const qType = q.questionType as ExamQuestionType;
        const totalAnswers = stats.answerCount;
        const gradedCount = stats.gradedCount;
        return {
          questionId: q.id,
          questionIndex: (q.order ?? idx) + 1,
          questionLabel: labels.get(q.id)?.label,
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

  return {
    loading: metadata.isLoading,
    isQuestionLoading: answers.isLoading,
    questionProgress,
    answersByQuestion,
    error: metadata.error?.message,
    selectedQuestionError: answers.error?.message,
    refresh,
  };
}
