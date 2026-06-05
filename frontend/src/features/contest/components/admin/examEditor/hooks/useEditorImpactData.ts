/**
 * useEditorImpactData — fetches grading data once for the exam editor so that
 * ScorePolicyMenu can show a before/after score distribution preview.
 *
 * Lazy: fetches on first trigger (user opens the policy menu), then caches.
 * Questions are derived from the current paper state so they're always fresh.
 */
import { useCallback, useMemo, useRef, useState } from "react";
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

interface RawGradingData {
  /** All student-role participant IDs. */
  studentIds: string[];
  /** Answers keyed by studentId. Only studentId, questionId, score are meaningful. */
  answersByStudent: Map<string, GradingAnswerRow[]>;
}

export interface UseEditorImpactDataResult {
  /** Fully derived impact context — always reflects the latest paper state. */
  impactContext: ScorePolicyMenuImpactContext;
  /**
   * Call this when the user opens the policy menu.
   * No-op if data is already loaded or loading.
   */
  ensureLoaded: () => void;
}

export function useEditorImpactData(
  contestId: string | undefined,
  allQuestionsForPolicy: PolicyQuestion[],
): UseEditorImpactDataResult {
  const [rawData, setRawData] = useState<RawGradingData | null>(null);
  const loadingRef = useRef(false);

  const ensureLoaded = useCallback(() => {
    if (!contestId || rawData !== null || loadingRef.current) return;
    loadingRef.current = true;

    void (async () => {
      try {
        const [participantsRes, answersRes] = await Promise.all([
          getContestParticipants(contestId),
          getAllExamAnswersForGrading(contestId),
        ]);

        // Filter to student-role only
        const studentIds = participantsRes
          .filter((p) => !p.accountRole || p.accountRole === "student")
          .map((p) => String(p.userId));

        const answersByStudent = new Map<string, GradingAnswerRow[]>();
        for (const sid of studentIds) {
          answersByStudent.set(sid, []);
        }
        for (const answer of answersRes.data) {
          const sid = answer.participantUserId;
          if (!answersByStudent.has(sid)) continue; // skip non-student-role
          const list = answersByStudent.get(sid)!;
          // Minimal row — only studentId, questionId, score are read by simulation
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

        setRawData({ studentIds, answersByStudent });
      } catch (err) {
        console.error("[useEditorImpactData] Failed to load grading data for preview:", err);
      } finally {
        loadingRef.current = false;
      }
    })();
  }, [contestId, rawData]);

  // Derive impactContext — questions come from current paper state (always fresh)
  const impactContext = useMemo<ScorePolicyMenuImpactContext>(() => {
    const questions: QuestionProgress[] = allQuestionsForPolicy.map((q, idx) => ({
      questionId: q.id,
      questionIndex: (q.order ?? idx) + 1,
      questionType: (q.questionType ?? "single_choice") as QuestionProgress["questionType"],
      prompt: q.prompt ?? "",
      maxScore: q.score,
      scorePolicy: (q.scorePolicy ?? "normal") as ExamQuestionScorePolicy,
      scorePolicyConfig: q.scorePolicyConfig,
      totalAnswers: 0,
      gradedCount: 0,
      progressPercent: 0,
      isObjective: true,
    }));

    return {
      questions,
      studentIds: rawData?.studentIds ?? [],
      answersByStudent: rawData?.answersByStudent ?? new Map(),
    };
  }, [allQuestionsForPolicy, rawData]);

  return { impactContext, ensureLoaded };
}
