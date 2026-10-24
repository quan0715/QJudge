import { buildPaperQuestionLabels } from "@/features/contest/domain/paperQuestionLabels";
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

  const isPaperExam = Boolean(contestId) && contest?.contestType === "paper_exam";
  const scopeRef = useRef({ contestId, isPaperExam });
  if (scopeRef.current.contestId !== contestId || scopeRef.current.isPaperExam !== isPaperExam) {
    scopeRef.current = { contestId, isPaperExam };
  }
  const loadSequence = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const questionRequestRef = useRef<{
    scope: typeof scopeRef.current;
    promise: Promise<ExamQuestion[]>;
    settled: boolean;
  } | null>(null);
  const rowsRequestRef = useRef<{
    scope: typeof scopeRef.current;
    promise: Promise<GradingAnswerRow[]>;
  } | null>(null);

  /** Poll scores without reloading unchanged definitions or overlapping reads. */
  const loadRows = useCallback((refreshQuestions = false): Promise<GradingAnswerRow[]> => {
    if (scopeRef.current.contestId !== contestId || scopeRef.current.isPaperExam !== isPaperExam) return Promise.resolve([]);
    const scope = scopeRef.current;
    if (!contestId || !isPaperExam) {
      setAnswers([]);
      setQuestions([]);
      return Promise.resolve([]);
    }
    const pending = rowsRequestRef.current;
    if (!refreshQuestions && pending?.scope === scope) return pending.promise;
    const sequence = ++loadSequence.current;
    let definition = questionRequestRef.current;
    if (!definition || definition.scope !== scope || (refreshQuestions && definition.settled)) {
      const request = { scope, promise: getExamQuestions(contestId), settled: false };
      request.promise = request.promise.then((value) => {
        request.settled = true;
        return value;
      }, (error: unknown) => {
        if (questionRequestRef.current === request) questionRequestRef.current = null;
        throw error;
      });
      questionRequestRef.current = request;
      definition = request;
    }
    const questionsPromise = definition.promise;
    const promise = (async () => {
      const [{ data: allAnswers }, questions] = await Promise.all([
        getAllExamAnswersForGrading(contestId), questionsPromise,
      ]);
      const sortedQuestions = questions.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const rows = buildGradingRows(allAnswers, questions, participantMapRef.current);
      if (mountedRef.current && scopeRef.current === scope && sequence === loadSequence.current) {
        setQuestions(sortedQuestions);
        setAnswers(rows);
      }
      return rows;
    })().finally(() => {
      if (rowsRequestRef.current?.promise === promise) rowsRequestRef.current = null;
    });
    rowsRequestRef.current = { scope, promise };
    return promise;
  }, [contestId, isPaperExam]);

  // Fetch real data
  const fetchData = useCallback(async () => {
    const scope = scopeRef.current;
    const current = () => mountedRef.current && scopeRef.current === scope;
    if (!isPaperExam) {
      await loadRows();
      if (current()) setLoading(false);
      return;
    }
    setLoading(true);
    const loadingRows = loadRows(true);
    const sequence = loadSequence.current;
    try {
      await loadingRows;
    } catch (err) {
      if (current() && sequence === loadSequence.current) {
        console.error("Failed to fetch grading data:", err);
        setAnswers([]);
        setQuestions([]);
      }
    } finally {
      if (current()) setLoading(false);
    }
  }, [isPaperExam, loadRows]);

  useEffect(() => {
    void fetchData();
  }, [fetchData, refetchOnParticipantsChange ? participantMap : null]);

  // ── Derived: unique question info (source of truth = question list; fallback = answers) ──
  const questionInfoMap = useMemo(() => {
    const labels = buildPaperQuestionLabels(questions);
    const map = new Map<
      string,
      {
        questionId: string;
        questionIndex: number;
        questionLabel?: string;
        questionType: ExamQuestionType;
        prompt: string;
        gradingPrompt?: string;
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
          questionLabel: labels.get(q.id)?.label,
          questionType: q.questionType,
          prompt: q.prompt ?? "",
          gradingPrompt: q.gradingPrompt,
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
        questionLabel: a.questionLabel,
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
          questionLabel: q.questionLabel,
          questionType: q.questionType,
          prompt: q.prompt,
          gradingPrompt: q.gradingPrompt,
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
  // Global stats — everyone on the roster, staff test runs included; a test
  // run stops counting once it is reset.
  const globalStats = useMemo<GlobalStats>(() => {
    const answeredIds = new Set(answers.map((a) => a.studentId));
    const gradedAnswers = answers.filter((a) => a.score !== null).length;
    const subjective = answers.filter((a) => isSubjectiveType(a.questionType));
    return {
      totalStudents: answeredIds.size,
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
      { studentId: string; username: string; displayName?: string }
    >();
    for (const p of participants) {
      const id = String(p.userId);
      map.set(id, {
        studentId: id,
        username: p.username,
        displayName: p.displayName ?? p.username,
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
      if (!contestId) throw new Error("Contest not found");
      await gradeExamAnswer(contestId, answerId, { score, feedback });
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
    },
    [contestId]
  );

  const ungradeAnswer = useCallback(
    async (answerId: string) => {
      if (!contestId) throw new Error("Contest not found");
      await ungradeExamAnswer(contestId, answerId);
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
    ungradeAnswer,
    regradeObjectiveAnswers,
    regradingObjective,
    refreshData,
    /** Background refresh: returns the latest rows and never shows the loading screen. */
    reloadAnswers: loadRows,
    loading,
  };
}
