/**
 * Data hook for exam grading.
 * Fetches real data from API.
 */
import {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useContext,
  useRef,
} from "react";
import { useParams } from "react-router-dom";
import {
  getAllExamAnswersForGrading,
  gradeExamAnswer,
  ungradeExamAnswer,
} from "@/infrastructure/api/repositories/examAnswers.repository";
import { getExamQuestions } from "@/infrastructure/api/repositories/examQuestions.repository";
import type {
  ContestParticipant,
  ExamQuestion,
  ExamQuestionScorePolicy,
  ExamQuestionType,
} from "@/core/entities/contest.entity";
import ContestAdminContext from "@/features/contest/contexts/ContestAdminContext";
import { useContest } from "@/features/contest/contexts/ContestContext";
import { isSubjectiveType } from "./gradingTypes";
import { calculateObjectiveExpectedScore } from "./objectiveRegrade";
import { buildGradingRows } from "./buildGradingRows";
import type {
  GradingAnswerRow,
  QuestionProgress,
  GlobalStats,
} from "./gradingTypes";

interface UseGradingDataOptions {
  participantsOverride?: ContestParticipant[];
  refetchOnParticipantsChange?: boolean;
}

export function useGradingData(options: UseGradingDataOptions = {}) {
  const { contestId } = useParams<{ contestId: string }>();
  const contestAdminContext = useContext(ContestAdminContext);
  const participants = useMemo(
    () => options.participantsOverride ?? contestAdminContext?.participants ?? [],
    [options.participantsOverride, contestAdminContext?.participants],
  );
  const refetchOnParticipantsChange =
    options.refetchOnParticipantsChange ?? true;
  const { contest } = useContest();

  const [answers, setAnswers] = useState<GradingAnswerRow[]>([]);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [regradingObjective, setRegradingObjective] = useState(false);

  // Build participant map
  const participantMap = useMemo(() => {
    const map = new Map<string, { username: string; displayName: string }>();
    for (const p of participants) {
      map.set(String(p.userId), {
        username: p.username,
        displayName: p.displayName ?? p.username,
      });
    }
    return map;
  }, [participants]);
  const participantMapRef = useRef(participantMap);
  useEffect(() => {
    participantMapRef.current = participantMap;
  }, [participantMap]);

  // Fetch real data
  const fetchData = useCallback(async () => {
    if (!contestId || contest?.contestType !== "paper_exam") {
      setAnswers([]);
      setQuestions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [{ data: allAnswers }, questions] = await Promise.all([
        getAllExamAnswersForGrading(contestId),
        getExamQuestions(contestId),
      ]);

      const sortedQuestions = questions
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      setQuestions(sortedQuestions);

      const rows = buildGradingRows(
        allAnswers,
        questions,
        participantMapRef.current,
      );
      setAnswers(rows);
    } catch (err) {
      console.error("Failed to fetch grading data:", err);
      setAnswers([]);
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  }, [
    contest?.contestType,
    contestId,
  ]);

  useEffect(() => {
    void fetchData();
  }, [fetchData, refetchOnParticipantsChange ? participantMap : null]);

  // ── Derived: unique question info (source of truth = question list; fallback = answers) ──
  const questionInfoMap = useMemo(() => {
    const map = new Map<
      string,
      {
        questionId: string;
        questionIndex: number;
        questionType: ExamQuestionType;
        prompt: string;
        maxScore: number;
        effectiveMaxScore?: number;
        scorePolicy?: ExamQuestionScorePolicy;
        scorePolicyConfig?: { redistributeTo?: string[] } | null;
      }
    >();

      // Always include all questions, even if no answer exists.
      for (let idx = 0; idx < questions.length; idx += 1) {
        const q = questions[idx];
        map.set(q.id, {
          questionId: q.id,
          questionIndex: (q.order ?? idx) + 1,
          questionType: q.questionType,
          prompt: q.prompt ?? "",
          maxScore: q.score ?? 0,
          effectiveMaxScore: q.effectiveMaxScore,
          scorePolicy: q.scorePolicy ?? "normal",
          scorePolicyConfig: q.scorePolicyConfig,
        });
      }

    // Backfill orphan answer rows defensively if a question was deleted outside the editor contract.
    for (const a of answers) {
      if (map.has(a.questionId)) continue;
      map.set(a.questionId, {
        questionId: a.questionId,
        questionIndex: a.questionIndex,
        questionType: a.questionType,
        prompt: a.questionPrompt,
        maxScore: a.maxScore,
      });
    }
    return map;
  }, [questions, answers]);

  // ── Derived: answers grouped by question ──
  const answersByQuestion = useMemo(() => {
    const map = new Map<string, GradingAnswerRow[]>();
    for (const a of answers) {
      const list = map.get(a.questionId) ?? [];
      list.push(a);
      map.set(a.questionId, list);
    }
    return map;
  }, [answers]);

  // ── Derived: answers grouped by student ──
  const answersByStudent = useMemo(() => {
    const map = new Map<string, GradingAnswerRow[]>();
    for (const a of answers) {
      const list = map.get(a.studentId) ?? [];
      list.push(a);
      map.set(a.studentId, list);
    }
    return map;
  }, [answers]);

  // ── Derived: per-question progress ──
  const questionProgress = useMemo<QuestionProgress[]>(() => {
    return Array.from(questionInfoMap.values())
      .sort((a, b) => a.questionIndex - b.questionIndex)
      .map((q) => {
        const qAnswers = answersByQuestion.get(q.questionId) ?? [];
        const gradedCount = qAnswers.filter((a) => a.score !== null).length;
        const totalAnswers = qAnswers.length;
        const objective = !isSubjectiveType(q.questionType);
        return {
          questionId: q.questionId,
          questionIndex: q.questionIndex,
          questionType: q.questionType,
          prompt: q.prompt,
          maxScore: q.maxScore,
          effectiveMaxScore: q.effectiveMaxScore,
          totalAnswers,
          gradedCount,
          progressPercent:
            totalAnswers > 0
              ? Math.round((gradedCount / totalAnswers) * 100)
              : 0,
          isObjective: objective,
          scorePolicy: q.scorePolicy,
          scorePolicyConfig: q.scorePolicyConfig,
        };
      });
  }, [questionInfoMap, answersByQuestion]);

  // ── Derived: global stats ──
  // Global stats — scoped to student-role participants only to avoid
  // counting admin/TA test submissions in grading progress.
  const globalStats = useMemo<GlobalStats>(() => {
    const studentOnlyIds = new Set(
      participants
        .filter((p) => !p.accountRole || p.accountRole === "student")
        .map((p) => String(p.userId)),
    );
    const studentAnswers = answers.filter((a) => studentOnlyIds.has(a.studentId));
    const studentIds = new Set(studentAnswers.map((a) => a.studentId));
    const gradedAnswers = studentAnswers.filter((a) => a.score !== null).length;
    const subjective = studentAnswers.filter((a) => isSubjectiveType(a.questionType));
    return {
      totalStudents: studentIds.size,
      totalParticipants: studentOnlyIds.size,
      totalQuestions: questionInfoMap.size,
      totalAnswers: studentAnswers.length,
      gradedAnswers,
      ungradedAnswers: studentAnswers.length - gradedAnswers,
      subjectiveTotal: subjective.length,
      subjectiveGraded: subjective.filter((a) => a.score !== null).length,
    };
  }, [answers, questionInfoMap, participants]);

  // ── Unique student list (from all participants, not just answers) ──
  const students = useMemo(() => {
    // Start from all participants
    const map = new Map<
      string,
      { studentId: string; username: string; displayName?: string; accountRole?: string }
    >();
    for (const p of participants) {
      const id = String(p.userId);
      map.set(id, {
        studentId: id,
        username: p.username,
        displayName: p.displayName ?? p.username,
        accountRole: p.accountRole,
      });
    }
    // Also include any students from answers that might not be in participants
    for (const a of answers) {
      if (!map.has(a.studentId)) {
        map.set(a.studentId, {
          studentId: a.studentId,
          username: a.studentUsername,
          displayName: a.studentDisplayName || a.studentUsername,
        });
      }
    }
    return Array.from(map.values());
  }, [participants, answers]);

  // ── Actions ──
  const gradeAnswer = useCallback(
    async (answerId: string, score: number, feedback: string) => {
      // Optimistic update
      setAnswers((prev) =>
        prev.map((a) =>
          a.id === answerId
            ? {
                ...a,
                score,
                feedback,
                gradedBy: "you",
                gradedAt: new Date().toISOString(),
                isAutoGraded: false,
              }
            : a
        )
      );

      if (contestId) {
        try {
          await gradeExamAnswer(contestId, answerId, {
            score,
            feedback: feedback || undefined,
          });
        } catch {
          // Revert on failure would go here
        }
      }
    },
    [contestId]
  );

  const ungradeAnswer = useCallback(
    async (answerId: string) => {
      // Optimistic update
      setAnswers((prev) =>
        prev.map((a) =>
          a.id === answerId
            ? {
                ...a,
                score: null,
                feedback: "",
                gradedBy: null,
                gradedAt: null,
                isAutoGraded: false,
              }
            : a
        )
      );

      if (contestId) {
        try {
          await ungradeExamAnswer(contestId, answerId);
        } catch {
          // Revert on failure — refetch
          void fetchData();
        }
      }
    },
    [contestId, fetchData]
  );

  const refreshData = useCallback(() => {
    void fetchData();
  }, [fetchData]);

  const regradeObjectiveAnswers = useCallback(async () => {
    if (!contestId) {
      return { total: 0, updated: 0, failed: 0, skipped: 0 };
    }

    const objectiveRows = answers.filter((row) => !isSubjectiveType(row.questionType));
    if (objectiveRows.length === 0) {
      return { total: 0, updated: 0, failed: 0, skipped: 0 };
    }

    setRegradingObjective(true);
    let updated = 0;
    let failed = 0;
    let skipped = 0;

    try {
      for (const row of objectiveRows) {
        const expected = calculateObjectiveExpectedScore(row);
        if (expected === null) {
          skipped += 1;
          continue;
        }

        if (row.score !== null && Number(row.score) === expected) {
          skipped += 1;
          continue;
        }

        try {
          await gradeExamAnswer(contestId, row.id, {
            score: expected,
            feedback: row.feedback || "Objective regrade",
          });
          updated += 1;
        } catch (error) {
          console.error("Failed to regrade objective answer:", error);
          failed += 1;
        }
      }
    } finally {
      await fetchData();
      setRegradingObjective(false);
    }

    return {
      total: objectiveRows.length,
      updated,
      failed,
      skipped,
    };
  }, [answers, contestId, fetchData]);

  return {
    answers,
    answersByQuestion,
    answersByStudent,
    questionProgress,
    globalStats,
    students,
    gradeAnswer,
    ungradeAnswer,
    regradeObjectiveAnswers,
    regradingObjective,
    refreshData,
    loading,
  };
}
