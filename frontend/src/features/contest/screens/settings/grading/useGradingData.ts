/**
 * Data hook for exam grading.
 * Fetches real data from API.
 */
import { useState, useMemo, useCallback, useEffect } from "react";
import { useParams } from "react-router-dom";
import {
  getAllExamAnswers,
  gradeExamAnswer,
} from "@/infrastructure/api/repositories/examAnswers.repository";
import { getExamQuestions } from "@/infrastructure/api/repositories/examQuestions.repository";
import type { ExamQuestion } from "@/core/entities/contest.entity";
import { useContestAdmin } from "@/features/contest/contexts";
import { isSubjectiveType } from "./gradingTypes";
import type {
  GradingAnswerRow,
  QuestionProgress,
  GlobalStats,
  QuestionType,
} from "./gradingTypes";

export function useGradingData() {
  const { contestId } = useParams<{ contestId: string }>();
  const { participants } = useContestAdmin();

  const [answers, setAnswers] = useState<GradingAnswerRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Build participant map
  const participantMap = useMemo(() => {
    const map = new Map<string, { username: string; nickname: string }>();
    for (const p of participants) {
      map.set(String(p.userId), {
        username: p.username,
        nickname: p.nickname ?? p.displayName ?? p.username,
      });
    }
    return map;
  }, [participants]);

  // Fetch real data
  const fetchData = useCallback(async () => {
    if (!contestId) return;
    setLoading(true);
    try {
      const [allAnswers, questions] = await Promise.all([
        getAllExamAnswers(contestId),
        getExamQuestions(contestId),
      ]);

      // Build question map for order + correctAnswer lookup
      const questionsMap = new Map<string, ExamQuestion>();
      questions.forEach((q, i) => questionsMap.set(q.id, { ...q, order: q.order ?? i }));

      // Build rows from API answers
      const rows: GradingAnswerRow[] = allAnswers.map((a) => {
        const q = questionsMap.get(a.questionId);
        const qIdx = q ? q.order : 0;
        const qType = (a.questionType ?? "short_answer") as QuestionType;
        const isAuto =
          qType === "true_false" ||
          qType === "single_choice" ||
          qType === "multiple_choice";

        const studentId = a.participantUserId ?? a.id;
        const studentUsername =
          a.participantUsername ??
          participantMap.get(studentId)?.username ??
          "unknown";
        const studentNickname =
          a.participantNickname ??
          participantMap.get(studentId)?.nickname ??
          studentUsername;

        const correctAnswer =
          a.questionSnapshot?.correctAnswer ??
          q?.correctAnswer ??
          null;

        return {
          id: a.id,
          studentId,
          studentUsername,
          studentNickname,
          questionId: a.questionId,
          questionIndex: qIdx + 1,
          questionPrompt: a.questionPrompt ?? "",
          questionType: qType,
          questionOptions: a.questionOptions ?? [],
          maxScore: a.maxScore ?? 0,
          answerContent: a.answer,
          score: a.score,
          feedback: a.feedback ?? "",
          gradedBy: a.gradedByUsername,
          gradedAt: a.gradedAt,
          isAutoGraded: isAuto && a.score !== null,
          correctAnswer,
        };
      });

      setAnswers(rows);
    } catch (err) {
      console.error("Failed to fetch grading data:", err);
      setAnswers([]);
    } finally {
      setLoading(false);
    }
  }, [contestId, participantMap]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // ── Derived: unique question info from answers ──
  const questionInfoMap = useMemo(() => {
    const map = new Map<
      string,
      {
        questionId: string;
        questionIndex: number;
        questionType: QuestionType;
        prompt: string;
        maxScore: number;
      }
    >();
    for (const a of answers) {
      if (!map.has(a.questionId)) {
        map.set(a.questionId, {
          questionId: a.questionId,
          questionIndex: a.questionIndex,
          questionType: a.questionType,
          prompt: a.questionPrompt,
          maxScore: a.maxScore,
        });
      }
    }
    return map;
  }, [answers]);

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
          totalAnswers,
          gradedCount,
          progressPercent:
            totalAnswers > 0
              ? Math.round((gradedCount / totalAnswers) * 100)
              : 0,
          isObjective: objective,
        };
      });
  }, [questionInfoMap, answersByQuestion]);

  // ── Derived: global stats ──
  const globalStats = useMemo<GlobalStats>(() => {
    const studentIds = new Set(answers.map((a) => a.studentId));
    const gradedAnswers = answers.filter((a) => a.score !== null).length;
    const subjective = answers.filter((a) => isSubjectiveType(a.questionType));
    return {
      totalStudents: studentIds.size,
      totalQuestions: questionInfoMap.size,
      totalAnswers: answers.length,
      gradedAnswers,
      ungradedAnswers: answers.length - gradedAnswers,
      subjectiveTotal: subjective.length,
      subjectiveGraded: subjective.filter((a) => a.score !== null).length,
    };
  }, [answers, questionInfoMap]);

  // ── Unique student list ──
  const students = useMemo(() => {
    const map = new Map<
      string,
      { studentId: string; username: string; nickname: string }
    >();
    for (const a of answers) {
      if (!map.has(a.studentId)) {
        map.set(a.studentId, {
          studentId: a.studentId,
          username: a.studentUsername,
          nickname: a.studentNickname,
        });
      }
    }
    return Array.from(map.values());
  }, [answers]);

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

  const refreshData = useCallback(() => {
    void fetchData();
  }, [fetchData]);

  return {
    answers,
    answersByQuestion,
    answersByStudent,
    questionProgress,
    globalStats,
    students,
    gradeAnswer,
    refreshData,
    loading,
  };
}
