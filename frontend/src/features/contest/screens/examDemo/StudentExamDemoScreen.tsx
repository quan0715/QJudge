import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { FC } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Button,
  Tag,
  Loading,
} from "@carbon/react";
import {
  ChevronLeft,
  Time,
} from "@carbon/icons-react";
import { getContest } from "@/infrastructure/api/repositories";
import { getExamQuestions } from "@/infrastructure/api/repositories/examQuestions.repository";
import { getContestProblem } from "@/infrastructure/api/repositories/contestProblems.repository";
import { ProblemPreview, ProblemHeaderCard } from "@/shared/ui/problem";
import { ExamQuestionCard } from "../../components/exam/ExamQuestionCard";
import { PaperExamCore } from "../../components/exam/PaperExamCore";
import type { ExamItem } from "../../types/exam.types";
import type { ExamQuestion } from "@/core/entities/contest.entity";
import type { ContestDetail } from "@/core/entities/contest.entity";
import type { ProblemDetail } from "@/core/entities/problem.entity";
import styles from "./StudentExamDemoScreen.module.scss";

const MOCK_DURATION_SEC = 90 * 60;

function useCountdown(totalSec: number) {
  const [remaining, setRemaining] = useState(totalSec);

  useEffect(() => {
    const id = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(id);
  }, []);

  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  return { remaining, display: `${mm}:${ss}`, total: totalSec };
}

const StudentExamDemoScreen: FC = () => {
  const navigate = useNavigate();
  const { contestId } = useParams<{ contestId: string }>();

  const [contest, setContest] = useState<ContestDetail | null>(null);
  const [contestLoading, setContestLoading] = useState(true);
  const [examQuestions, setExamQuestions] = useState<ExamQuestion[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(true);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [problemDetails, setProblemDetails] = useState<Record<string, ProblemDetail>>({});
  const loadingProblemIdsRef = useRef<Set<string>>(new Set());

  const countdown = useCountdown(MOCK_DURATION_SEC);

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
    if (!contestId) return;
    setLoadingQuestions(true);
    getExamQuestions(contestId)
      .then(setExamQuestions)
      .catch(() => setExamQuestions([]))
      .finally(() => setLoadingQuestions(false));
  }, [contestId]);

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

  const handleBack = () => {
    navigate(-1);
  };

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
            {item.data.score != null && (
              <span className={styles.codingScore}>{item.data.score} 分</span>
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
        <Loading withOverlay={false} small />
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
      toolbarLeft={(
        <>
          <Button
            kind="ghost"
            size="sm"
            hasIconOnly
            renderIcon={ChevronLeft}
            iconDescription="返回"
            onClick={handleBack}
          />
          <span className={styles.title}>{contest.name}</span>
          <Tag size="sm" type="purple">Demo 模式</Tag>
        </>
      )}
      toolbarCenter={(
        <div className={styles.timer}>
          <Time size={16} />
          <span className={styles.timerText}>{countdown.display}</span>
        </div>
      )}
    />
  );
};

export default StudentExamDemoScreen;
