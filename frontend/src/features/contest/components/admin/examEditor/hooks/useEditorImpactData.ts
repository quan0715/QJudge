import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getAllExamAnswersForGrading,
} from "@/infrastructure/api/repositories/examAnswers.repository";
import { getContestParticipants } from "@/infrastructure/api/repositories/contestParticipants.repository";
import type { GradingAnswerRow } from "@/features/contest/screens/settings/grading/gradingTypes";
import type { QuestionProgress } from "@/features/contest/screens/settings/grading/gradingTypes";
import type { ScorePolicyMenuImpactContext } from "@/features/contest/screens/settings/grading/components/ScorePolicyMenu";
import type { ExamQuestionScorePolicy } from "@/core/entities/contest.entity";

interface PolicyQuestion {
  id: string;
  order: number;
  prompt: string;
  score: number;
  questionType?: string;
  scorePolicy?: string;
  scorePolicyConfig?: { redistributeTo?: string[] } | null;
}

export type EditorImpactStatus = "idle" | "loading" | "loaded" | "error";

interface RawGradingData {
  answerCounts: Map<string, { total: number; graded: number }>;
  /** Current roster participant IDs, including staff test runs. */
  studentIds: string[];
  /** Answers keyed by studentId. Only studentId, questionId, score are meaningful. */
  answersByStudent: Map<string, GradingAnswerRow[]>;
}

export interface UseEditorImpactDataResult {
  impactContext: ScorePolicyMenuImpactContext;
  status: EditorImpactStatus;
  /** Deduplicates initial loads. Failures require an explicit retry. */
  ensureLoaded: () => void;
  /** Invalidates counts immediately, including after grading mutations. */
  refresh: () => void;
}

export function useEditorImpactData(
  contestId: string | undefined,
  allQuestionsForPolicy: PolicyQuestion[],
): UseEditorImpactDataResult {
  const [snapshot, setSnapshot] = useState<{
    contestId: string;
    status: EditorImpactStatus;
    data: RawGradingData | null;
  } | null>(null);
  const requestRef = useRef<{ contestId: string } | null>(null);

  const load = useCallback((force: boolean) => {
    if (!contestId) return;
    if (!force && requestRef.current?.contestId === contestId) return;
    const request = { contestId };
    requestRef.current = request;
    setSnapshot({ contestId, status: "loading", data: null });

    void (async () => {
      try {
        const [participantsRes, answersRes] = await Promise.all([
          getContestParticipants(contestId),
          getAllExamAnswersForGrading(contestId),
        ]);
        if (requestRef.current !== request) return;
        const studentIds = participantsRes.map((p) => String(p.userId));
        const answersByStudent = new Map<string, GradingAnswerRow[]>();
        const answerCounts = new Map<string, { total: number; graded: number }>();
        for (const sid of studentIds) answersByStudent.set(sid, []);
        for (const answer of answersRes.data) {
          // Regrading operates on all answers, independently of today's roster.
          const count = answerCounts.get(answer.questionId) ?? { total: 0, graded: 0 };
          count.total += 1;
          if (answer.score != null) count.graded += 1;
          answerCounts.set(answer.questionId, count);
          const sid = answer.participantUserId;
          const list = answersByStudent.get(sid);
          if (!list) continue;
          list.push({
            id: answer.id,
            studentId: sid,
            studentUsername: "",
            studentDisplayName: "",
            questionId: answer.questionId,
            questionIndex: 0,
            questionPrompt: "",
            questionType: "single_choice",
            questionOptions: [],
            maxScore: 0,
            answerContent: {},
            score: answer.score,
            feedback: "",
            gradedBy: null,
            gradedAt: null,
            isAutoGraded: false,
            correctAnswer: null,
          });
        }
        setSnapshot({ contestId, status: "loaded", data: { studentIds, answersByStudent, answerCounts } });
      } catch (err) {
        if (requestRef.current !== request) return;
        setSnapshot({ contestId, status: "error", data: null });
        console.error("[useEditorImpactData] Failed to load grading data for preview:", err);
      }
    })();
  }, [contestId]);

  const ensureLoaded = useCallback(() => load(false), [load]);
  const refresh = useCallback(() => load(true), [load]);
  useEffect(() => {
    ensureLoaded();
    return () => { requestRef.current = null; };
  }, [ensureLoaded]);

  // Never expose the previous contest's snapshot while its successor loads.
  const status = snapshot && snapshot.contestId === contestId ? snapshot.status : "idle";
  const rawData = snapshot && snapshot.contestId === contestId ? snapshot.data : null;

  // Derive impactContext — questions come from current paper state (always fresh)
  const impactContext = useMemo<ScorePolicyMenuImpactContext>(() => {
    const answerCounts = rawData?.answerCounts;

    const questions: QuestionProgress[] = allQuestionsForPolicy.map((q, idx) => ({
      questionId: q.id,
      questionIndex: (q.order ?? idx) + 1,
      questionType: (q.questionType ?? "single_choice") as QuestionProgress["questionType"],
      prompt: q.prompt ?? "",
      maxScore: q.score,
      scorePolicy: (q.scorePolicy ?? "normal") as ExamQuestionScorePolicy,
      scorePolicyConfig: q.scorePolicyConfig,
      totalAnswers: answerCounts?.get(q.id)?.total ?? 0,
      gradedCount: answerCounts?.get(q.id)?.graded ?? 0,
      progressPercent: 0,
      isObjective: true,
    }));

    return {
      questions,
      studentIds: rawData?.studentIds ?? [],
      answersByStudent: rawData?.answersByStudent ?? new Map(),
    };
  }, [allQuestionsForPolicy, rawData]);

  return { impactContext, status, ensureLoaded, refresh };
}
