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
import { getSubmissions } from "@/infrastructure/api/repositories/submission.repository";
import type { ContestParticipant, ExamQuestion, ExamQuestionScorePolicy } from "@/core/entities/contest.entity";
import ContestAdminContext from "@/features/contest/contexts/ContestAdminContext";
import { useContest } from "@/features/contest/contexts/ContestContext";
import { isSubjectiveType } from "./gradingTypes";
import { calculateObjectiveExpectedScore } from "./objectiveRegrade";
import { buildGradingRows } from "./buildGradingRows";
import type {
  GradingAnswerRow,
  QuestionProgress,
  GlobalStats,
  QuestionType,
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
  const { contest, scoreboardData } = useContest();

  const [answers, setAnswers] = useState<GradingAnswerRow[]>([]);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [regradingObjective, setRegradingObjective] = useState(false);

  const codingCanonicalQuestions = useMemo(() => {
    if (contest?.contestType !== "coding") return [];

    const orderedContestProblems = [...(contest.problems || [])].sort(
      (left, right) => (left.order ?? 0) - (right.order ?? 0),
    );
    const scoreboardProblems = [...(scoreboardData?.problems || [])].sort(
      (left, right) => (left.order ?? 0) - (right.order ?? 0),
    );

    const canonicalById = new Map<
      string,
      { id: string; order: number; title: string; maxScore: number; label?: string }
    >();
    const submissionToCanonical = new Map<string, string>();

    for (let idx = 0; idx < scoreboardProblems.length; idx += 1) {
      const problem = scoreboardProblems[idx];
      const canonicalId = String(problem.id || problem.problemId || "");
      if (!canonicalId) continue;
      canonicalById.set(canonicalId, {
        id: canonicalId,
        order: problem.order ?? idx + 1,
        title: problem.title || problem.label || `P${idx + 1}`,
        maxScore: Number(problem.score ?? 0),
        label: problem.label,
      });
      submissionToCanonical.set(canonicalId, canonicalId);
      if (problem.problemId) {
        submissionToCanonical.set(String(problem.problemId), canonicalId);
      }
    }

    for (let idx = 0; idx < orderedContestProblems.length; idx += 1) {
      const problem = orderedContestProblems[idx];
      const submissionProblemId = String(problem.problemId || "");
      if (!submissionProblemId) continue;

      let canonicalId = submissionToCanonical.get(submissionProblemId);
      if (!canonicalId && problem.label) {
        const matchByLabel = scoreboardProblems.find((row) => row.label === problem.label);
        canonicalId = matchByLabel?.id ? String(matchByLabel.id) : undefined;
      }
      if (!canonicalId && idx < scoreboardProblems.length) {
        const matchByOrder = scoreboardProblems[idx];
        canonicalId = matchByOrder?.id ? String(matchByOrder.id) : undefined;
      }
      if (!canonicalId) canonicalId = submissionProblemId;

      if (!canonicalById.has(canonicalId)) {
        canonicalById.set(canonicalId, {
          id: canonicalId,
          order: problem.order ?? idx + 1,
          title: problem.title || `P${idx + 1}`,
          maxScore: Number(problem.maxScore ?? problem.score ?? 0),
          label: problem.label,
        });
      }
      submissionToCanonical.set(submissionProblemId, canonicalId);
    }

    const ordered = Array.from(canonicalById.values()).sort((left, right) => {
      if (left.order !== right.order) return left.order - right.order;
      return left.id.localeCompare(right.id);
    });

    return ordered.map((problem, index) => ({
      ...problem,
      index: index + 1,
      indexByOrder: problem.order || index + 1,
      submissionToCanonical,
    }));
  }, [contest?.contestType, contest?.problems, scoreboardData?.problems]);

  const codingSubmissionToCanonicalMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const problem of codingCanonicalQuestions) {
      map.set(problem.id, problem.id);
      for (const [sourceId, canonicalId] of problem.submissionToCanonical.entries()) {
        map.set(sourceId, canonicalId);
      }
    }
    return map;
  }, [codingCanonicalQuestions]);

  const codingProblemMetaMap = useMemo(() => {
    const map = new Map<
      string,
      { index: number; title: string; maxScore: number }
    >();
    for (const problem of codingCanonicalQuestions) {
      map.set(problem.id, {
        index: problem.index,
        title: problem.title,
        maxScore: problem.maxScore,
      });
    }
    return map;
  }, [codingCanonicalQuestions]);

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
    if (!contestId) return;
    setLoading(true);
    try {
      if (contest?.contestType === "coding") {
        const allSubmissions: Awaited<ReturnType<typeof getSubmissions>>["results"] = [];
        const pageSize = 100;
        let page = 1;
        let total = Number.POSITIVE_INFINITY;

        while (allSubmissions.length < total) {
          const response = await getSubmissions({
            contest: contestId,
            source_type: "contest",
            include_all: "true",
            page,
            page_size: pageSize,
          });
          total = response.count;
          allSubmissions.push(...response.results);
          if (response.results.length < pageSize) break;
          page += 1;
        }

        const latestSubmissionByStudentProblem = new Map<string, (typeof allSubmissions)[number]>();
        for (const submission of allSubmissions) {
          const canonicalProblemId =
            codingSubmissionToCanonicalMap.get(String(submission.problemId)) || String(submission.problemId);
          const key = `${submission.userId}:${canonicalProblemId}`;
          const prev = latestSubmissionByStudentProblem.get(key);
          if (!prev) {
            latestSubmissionByStudentProblem.set(key, submission);
            continue;
          }
          if (new Date(submission.createdAt).getTime() > new Date(prev.createdAt).getTime()) {
            latestSubmissionByStudentProblem.set(key, submission);
          }
        }

        const rows: GradingAnswerRow[] = Array.from(
          latestSubmissionByStudentProblem.values(),
        ).map((submission) => {
          const student = participantMapRef.current.get(submission.userId);
          const canonicalProblemId =
            codingSubmissionToCanonicalMap.get(String(submission.problemId)) || String(submission.problemId);
          const problemMeta = codingProblemMetaMap.get(canonicalProblemId);
          const normalizedScore = submission.score ?? 0;
          const isPending =
            submission.status === "pending" || submission.status === "judging";
          return {
            id: `coding-${submission.id}`,
            studentId: submission.userId,
            studentUsername: student?.username ?? submission.username ?? "unknown",
            studentDisplayName:
              student?.displayName ??
              submission.username ??
              "unknown",
            questionId: canonicalProblemId,
            questionIndex: problemMeta?.index ?? 0,
            questionPrompt: problemMeta?.title ?? canonicalProblemId,
            questionType: "essay",
            questionOptions: [],
            maxScore: problemMeta?.maxScore ?? 0,
            answerContent: {
              submissionId: submission.id,
              status: submission.status,
              language: submission.language,
              score: normalizedScore,
              execTime: submission.execTime ?? null,
              memoryUsage: submission.memoryUsage ?? null,
              createdAt: submission.createdAt,
            },
            score: isPending ? null : normalizedScore,
            feedback: "",
            gradedBy: null,
            gradedAt: null,
            isAutoGraded: true,
            correctAnswer: null,
            latestSubmissionId: submission.id,
            latestSubmissionStatus: submission.status,
            latestSubmissionLanguage: submission.language,
            latestSubmissionCreatedAt: submission.createdAt,
            latestSubmissionExecTime: submission.execTime ?? null,
            latestSubmissionMemoryUsage: submission.memoryUsage ?? null,
          };
        });

        const existingRowKeys = new Set(rows.map((row) => `${row.studentId}:${row.questionId}`));
        for (const standingRow of scoreboardData?.rows || []) {
          const studentId = String(standingRow.userId || "");
          if (!studentId) continue;
          const student = participantMapRef.current.get(studentId);

          for (const [rawProblemId, rawStats] of Object.entries(standingRow.problems || {})) {
            const canonicalProblemId =
              codingSubmissionToCanonicalMap.get(String(rawProblemId)) || String(rawProblemId);
            const key = `${studentId}:${canonicalProblemId}`;
            if (existingRowKeys.has(key)) continue;

            const stats = (rawStats || {}) as {
              status?: string | null;
              score?: number | null;
              tries?: number | null;
              time?: number | null;
              pending?: boolean | null;
            };
            const hasActivity =
              !!stats.pending ||
              Number(stats.tries ?? 0) > 0 ||
              Number(stats.score ?? 0) > 0 ||
              !!stats.status;
            if (!hasActivity) continue;

            const mappedStatus =
              stats.pending
                ? "pending"
                : stats.status === "AC"
                  ? "AC"
                  : stats.status
                    ? "WA"
                    : null;
            const problemMeta = codingProblemMetaMap.get(canonicalProblemId);
            const normalizedScore = Number(stats.score ?? 0);

            rows.push({
              id: `coding-standing-${studentId}-${canonicalProblemId}`,
              studentId,
              studentUsername:
                student?.username || standingRow.displayName || "unknown",
              studentDisplayName:
                student?.displayName || standingRow.displayName || "unknown",
              questionId: canonicalProblemId,
              questionIndex: problemMeta?.index ?? 0,
              questionPrompt: problemMeta?.title ?? canonicalProblemId,
              questionType: "essay",
              questionOptions: [],
              maxScore: problemMeta?.maxScore ?? 0,
              answerContent: {
                source: "standings_fallback",
                status: mappedStatus,
                score: normalizedScore,
                tries: Number(stats.tries ?? 0),
                time: Number(stats.time ?? 0),
              },
              score: stats.pending ? null : normalizedScore,
              feedback: "",
              gradedBy: null,
              gradedAt: null,
              isAutoGraded: true,
              correctAnswer: null,
              latestSubmissionId: null,
              latestSubmissionStatus: mappedStatus,
              latestSubmissionLanguage: null,
              latestSubmissionCreatedAt: null,
              latestSubmissionExecTime: null,
              latestSubmissionMemoryUsage: null,
            });
            existingRowKeys.add(key);
          }
        }

        setQuestions([]);
        setAnswers(rows);
        return;
      }

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
    codingProblemMetaMap,
    codingSubmissionToCanonicalMap,
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
        questionType: QuestionType;
        prompt: string;
        maxScore: number;
        scorePolicy?: ExamQuestionScorePolicy;
      }
    >();

    if (contest?.contestType === "coding") {
      for (const problem of codingCanonicalQuestions) {
        map.set(problem.id, {
          questionId: problem.id,
          questionIndex: problem.index,
          questionType: "essay",
          prompt: problem.title,
          maxScore: problem.maxScore,
        });
      }
    } else {
      // Always include all questions, even if no answer exists.
      for (let idx = 0; idx < questions.length; idx += 1) {
        const q = questions[idx];
        map.set(q.id, {
          questionId: q.id,
          questionIndex: (q.order ?? idx) + 1,
          questionType: q.questionType,
          prompt: q.prompt ?? "",
          maxScore: q.score ?? 0,
          scorePolicy: q.scorePolicy ?? "normal",
        });
      }
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
  }, [contest?.contestType, codingCanonicalQuestions, questions, answers]);

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
          scorePolicy: q.scorePolicy,
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
