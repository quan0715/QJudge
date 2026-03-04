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
import { calculateObjectiveExpectedScore } from "./objectiveRegrade";
import { buildGradingRows } from "./buildGradingRows";
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
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [regradingObjective, setRegradingObjective] = useState(false);

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

      const sortedQuestions = questions
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      setQuestions(sortedQuestions);

      const rows = buildGradingRows(allAnswers, questions, participantMap);
      setAnswers(rows);
    } catch (err) {
      console.error("Failed to fetch grading data:", err);
      setAnswers([]);
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  }, [contestId, participantMap]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // ── Derived: unique question info (source of truth = question list; fallback = answers) ──
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

    // Always include all questions, even if no answer exists.
    for (let idx = 0; idx < questions.length; idx += 1) {
      const q = questions[idx];
      map.set(q.id, {
        questionId: q.id,
        questionIndex: (q.order ?? idx) + 1,
        questionType: q.questionType,
        prompt: q.prompt ?? "",
        maxScore: q.score ?? 0,
      });
    }

    // Backfill orphan answer rows (defensive: stale/deleted question snapshots).
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
      totalParticipants: participants.length,
      totalQuestions: questionInfoMap.size,
      totalAnswers: answers.length,
      gradedAnswers,
      ungradedAnswers: answers.length - gradedAnswers,
      subjectiveTotal: subjective.length,
      subjectiveGraded: subjective.filter((a) => a.score !== null).length,
    };
  }, [answers, questionInfoMap, participants]);

  // ── Unique student list (from all participants, not just answers) ──
  const students = useMemo(() => {
    // Start from all participants
    const map = new Map<
      string,
      { studentId: string; username: string; nickname: string }
    >();
    for (const p of participants) {
      const id = String(p.userId);
      map.set(id, {
        studentId: id,
        username: p.username,
        nickname: p.nickname ?? p.displayName ?? p.username,
      });
    }
    // Also include any students from answers that might not be in participants
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
    regradeObjectiveAnswers,
    regradingObjective,
    refreshData,
    loading,
  };
}
