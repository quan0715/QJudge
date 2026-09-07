import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { FC } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Button,
  Tag,
  Loading,
} from "@carbon/react";
import { getContest } from "@/infrastructure/api/repositories";
import { getExamQuestions } from "@/infrastructure/api/repositories/examQuestions.repository";
import { getContestProblem } from "@/infrastructure/api/repositories/contestProblems.repository";
import { ProblemPreview, ProblemHeaderCard } from "@/shared/ui/problem";
import { useCodingRuntimeNavigator } from "@/features/contest/hooks/useCodingRuntimeNavigator";
import { formatScore } from "@/shared/utils/scoreFormat";
import { ProblemFullPageSolve } from "@/features/problems/components/solve/editorview/ProblemFullPageSolve";
import ContestProblemSubmissions from "../../components/solver/submissions/ContestProblemSubmissions";
import { ExamQuestionCard } from "../../components/exam/ExamQuestionCard";
import { PaperExamCore } from "../../components/exam/PaperExamCore";
import type { ExamItem } from "../../types/exam.types";
import type { ExamQuestion } from "@/core/entities/contest.entity";
import type { ContestDetail } from "@/core/entities/contest.entity";
import type { CodingProblemDetail } from "@/core/entities/problem.entity";
import styles from "./StudentExamDemoScreen.module.scss";

const StudentExamDemoScreen: FC = () => {
  const navigate = useNavigate();
  const { contestId } = useParams<{ contestId: string }>();

  const [contest, setContest] = useState<ContestDetail | null>(null);
  const [contestLoading, setContestLoading] = useState(true);
  const [examQuestions, setExamQuestions] = useState<ExamQuestion[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [problemDetails, setProblemDetails] = useState<Record<string, CodingProblemDetail>>({});
  const [selectedCodingProblemId, setSelectedCodingProblemId] = useState<string | null>(null);
  const loadingProblemIdsRef = useRef<Set<string>>(new Set());

  const [acceptedProblemIds, setAcceptedProblemIds] = useState<Set<string>>(new Set());
  const handleAccepted = useCallback((id: string) => {
    setAcceptedProblemIds((previous) => previous.has(id) ? previous : new Set([...previous, id]));
  }, []);

  const items: ExamItem[] = useMemo(() => {
    const codingItems: ExamItem[] = (contest?.problems ?? []).map((p) => ({
      kind: "coding" as const,
      data: p,
    }));

    const questionItems: ExamItem[] = examQuestions.map((q) => ({
      kind: "question" as const,
      data: q,
    }));

    return [...codingItems, ...questionItems].sort((a, b) => {
      const orderA = a.kind === "coding" ? (a.data.order ?? 0) : a.data.order;
      const orderB = b.kind === "coding" ? (b.data.order ?? 0) : b.data.order;
      return orderA - orderB;
    });
  }, [contest?.problems, examQuestions]);

  const answeredIds = useMemo(() => {
    const ids = new Set<string>();
    for (const [id, value] of Object.entries(answers)) {
      if (value !== undefined && value !== null && value !== "") {
        if (Array.isArray(value) && value.length === 0) continue;
        ids.add(id);
      }
    }
    return ids;
  }, [answers]);

  useEffect(() => {
    if (!contestId) return;
    setContestLoading(true);
    getContest(contestId)
      .then((c) => setContest(c ?? null))
      .catch(() => setContest(null))
      .finally(() => setContestLoading(false));
  }, [contestId]);

  useEffect(() => {
    if (!contestId || contest?.contestType !== "paper_exam") return;
    setLoadingQuestions(true);
    getExamQuestions(contestId)
      .then(setExamQuestions)
      .catch(() => setExamQuestions([]))
      .finally(() => setLoadingQuestions(false));
  }, [contestId, contest?.contestType]);

  useEffect(() => {
    if (!contestId || items.length === 0) return;

    for (const item of items) {
      if (item.kind !== "coding") continue;
      const pid = item.data.problemId;
      if (problemDetails[pid]) continue;
      if (loadingProblemIdsRef.current.has(pid)) continue;
      loadingProblemIdsRef.current.add(pid);

      getContestProblem(contestId, item.data.id).then((detail) => {
        if (detail) {
          setProblemDetails((prev) => ({ ...prev, [pid]: detail }));
        }
      }).finally(() => {
        loadingProblemIdsRef.current.delete(pid);
      });
    }
  }, [contestId, items, problemDetails]);

  const handleAnswerChange = useCallback((questionId: string, value: unknown) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }, []);

  const handleBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  const codingProblems = useMemo(
    () => [...(contest?.problems ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [contest?.problems],
  );
  const activeCodingProblem = codingProblems.find(
    (problem) => problem.id === selectedCodingProblemId,
  ) ?? codingProblems[0];
  const activeCodingProblemDetail = activeCodingProblem
    ? problemDetails[activeCodingProblem.problemId]
    : undefined;

  const solvedIds = useMemo(() => new Set(codingProblems.filter((p) => acceptedProblemIds.has(p.problemId) || problemDetails[p.problemId]?.isSolved).map((p) => p.id)), [codingProblems, acceptedProblemIds, problemDetails]);
  const statementNavigation = useCodingRuntimeNavigator(contest?.contestType === "coding" ? codingProblems : [], activeCodingProblem?.id, solvedIds, setSelectedCodingProblemId);

  const renderItem = useCallback(
    (item: ExamItem, index: number, mode: "single" | "all") => {
      if (item.kind === "question") {
        return (
          <ExamQuestionCard
            question={item.data}
            index={index}
            answer={answers[item.data.id]}
            onAnswerChange={handleAnswerChange}
          />
        );
      }

      const detail = problemDetails[item.data.problemId];
      const heading =
        mode === "all"
          ? `第 ${index + 1} 題 — ${item.data.label}. ${item.data.title}`
          : `${item.data.label}. ${item.data.title}`;

      return (
        <div className={styles.codingCard}>
          <div className={styles.codingHeader}>
            <span className={styles.codingLabel}>
              {heading}
              <Tag size="sm" type="green">程式題</Tag>
            </span>
            {item.data.maxScore != null && (
              <span className={styles.codingScore}>{formatScore(item.data.maxScore)} 分</span>
            )}
          </div>

          {detail ? (
            <>
              {mode === "single" && (
                <ProblemHeaderCard
                  problem={detail}
                  showAcRate={false}
                  showTags={false}
                />
              )}
              <ProblemPreview problem={detail} compact />
            </>
          ) : (
            <Loading withOverlay={false} small description="載入題目中..." />
          )}
        </div>
      );
    },
    [answers, handleAnswerChange, problemDetails]
  );

  if (contestLoading || loadingQuestions) {
    return (
      <div className={styles.centered}>
        <Loading withOverlay={false} small description="載入考試資料中" />
        <span>載入考試資料中...</span>
      </div>
    );
  }

  if (!contest) {
    return (
      <div className={styles.centered}>
        <span>找不到考試資料</span>
      </div>
    );
  }

  if (contest.contestType === "coding") {
    if (codingProblems.length === 0) {
      return (
        <div className={styles.centered}>
          <span>此考試尚未設定任何程式題目</span>
          <Button kind="ghost" onClick={handleBack}>返回</Button>
        </div>
      );
    }

    if (!activeCodingProblem || !activeCodingProblemDetail) {
      return (
        <div className={styles.centered}>
          <Loading withOverlay={false} small description="載入程式題目中..." />
          <span>載入程式題目中...</span>
        </div>
      );
    }

    return (
      <div className={styles.codingPreview}>
        <main className={styles.codingWorkspace}>
          <ProblemFullPageSolve
        statementNavigation={statementNavigation}
            key={activeCodingProblem.id}
            onAccepted={handleAccepted}
            problem={activeCodingProblemDetail}
            problemLabel={activeCodingProblem.label}
            contestId={contest.id}
            disableCopy={contest.cheatDetectionEnabled}
            renderSubmissions={() => (
              <ContestProblemSubmissions
                contestId={contest.id}
                codingProblemId={activeCodingProblem.problemId}
              />
            )}
          />
        </main>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className={styles.centered}>
        <span>此考試尚未設定任何題目</span>
        <Button kind="ghost" onClick={handleBack}>返回</Button>
      </div>
    );
  }

  return (
    <PaperExamCore
      items={items}
      answeredIds={answeredIds}
      styles={styles}
      renderItem={renderItem}
      showToolbar={false}
      externalNavigator
    />
  );
};

export default StudentExamDemoScreen;
