import { useState, useEffect, useCallback, useMemo } from "react";
import type { FC } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  ContentSwitcher,
  Switch,
  Tag,
  Loading,
} from "@carbon/react";
import { ArrowLeft, ArrowRight, ChevronLeft } from "@carbon/icons-react";
import { useContest } from "@/features/contest/contexts/ContestContext";
import { getExamQuestions } from "@/infrastructure/api/repositories/examQuestions.repository";
import { getContestProblem } from "@/infrastructure/api/repositories/contestProblems.repository";
import { ProblemPreview, ProblemHeaderCard } from "@/shared/ui/problem";
import { ExamQuestionCard } from "../../components/exam/ExamQuestionCard";
import { ExamNavigator } from "../../components/exam/ExamNavigator";
import type { ExamItem, ExamViewMode } from "../../types/examDemo.types";
import type { ExamQuestion } from "@/core/entities/contest.entity";
import type { ProblemDetail } from "@/core/entities/problem.entity";
import styles from "./StudentExamDemoScreen.module.scss";

const StudentExamDemoScreen: FC = () => {
  const navigate = useNavigate();
  const { contest, loading: contestLoading } = useContest();

  const [examQuestions, setExamQuestions] = useState<ExamQuestion[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(true);
  const [viewMode, setViewMode] = useState<ExamViewMode>("single");
  const [activeIndex, setActiveIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  // Cache fetched problem details for coding problems
  const [problemDetails, setProblemDetails] = useState<Record<string, ProblemDetail>>({});

  // Build unified exam items list
  const items: ExamItem[] = useMemo(() => {
    const codingItems: ExamItem[] = (contest?.problems ?? []).map((p) => ({
      kind: "coding" as const,
      data: p,
    }));
    const questionItems: ExamItem[] = examQuestions.map((q) => ({
      kind: "question" as const,
      data: q,
    }));
    // Sort all by order (coding problems use their order field, exam questions use theirs)
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

  // Fetch exam questions
  useEffect(() => {
    if (!contest?.id) return;
    setLoadingQuestions(true);
    getExamQuestions(contest.id)
      .then(setExamQuestions)
      .catch(() => setExamQuestions([]))
      .finally(() => setLoadingQuestions(false));
  }, [contest?.id]);

  // Fetch problem detail for current coding problem in single mode
  const currentItem = items[activeIndex];
  useEffect(() => {
    if (!contest?.id || !currentItem || currentItem.kind !== "coding") return;
    const pid = currentItem.data.problemId;
    if (problemDetails[pid]) return;
    getContestProblem(contest.id, currentItem.data.id).then((detail) => {
      if (detail) {
        setProblemDetails((prev) => ({ ...prev, [pid]: detail }));
      }
    });
  }, [contest?.id, currentItem, problemDetails]);

  const handleAnswerChange = useCallback((questionId: string, value: unknown) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }, []);

  const handleBack = () => {
    navigate(-1);
  };

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

  const renderSingleMode = () => {
    const item = items[activeIndex];
    if (!item) return null;

    return (
      <div className={styles.singleContent}>
        <div className={styles.questionArea}>
          {item.kind === "question" ? (
            <ExamQuestionCard
              question={item.data}
              index={activeIndex}
              answer={answers[item.data.id]}
              onAnswerChange={handleAnswerChange}
            />
          ) : (
            <div className={styles.codingCard}>
              <div className={styles.codingHeader}>
                <span className={styles.codingLabel}>
                  {item.data.label}. {item.data.title}
                  <Tag size="sm" type="green">程式題</Tag>
                </span>
                {item.data.score != null && (
                  <span className={styles.codingScore}>{item.data.score} 分</span>
                )}
              </div>
              {problemDetails[item.data.problemId] ? (
                <>
                  <ProblemHeaderCard
                    problem={problemDetails[item.data.problemId]}
                    showAcRate={false}
                    showTags={false}
                  />
                  <ProblemPreview
                    problem={problemDetails[item.data.problemId]}
                    compact
                  />
                </>
              ) : (
                <Loading withOverlay={false} small description="載入題目中..." />
              )}
            </div>
          )}
        </div>

        <div className={styles.navButtons}>
          <Button
            kind="ghost"
            size="sm"
            renderIcon={ArrowLeft}
            disabled={activeIndex === 0}
            onClick={() => setActiveIndex((i) => i - 1)}
          >
            上一題
          </Button>
          <span className={styles.navInfo}>
            {activeIndex + 1} / {items.length}
          </span>
          <Button
            kind="ghost"
            size="sm"
            renderIcon={ArrowRight}
            disabled={activeIndex === items.length - 1}
            onClick={() => setActiveIndex((i) => i + 1)}
          >
            下一題
          </Button>
        </div>
      </div>
    );
  };

  const renderAllMode = () => (
    <div className={styles.allContent}>
      {items.map((item, index) => {
        if (item.kind === "question") {
          return (
            <ExamQuestionCard
              key={item.data.id}
              question={item.data}
              index={index}
              answer={answers[item.data.id]}
              onAnswerChange={handleAnswerChange}
            />
          );
        }
        return (
          <div key={item.data.id} className={styles.codingCard}>
            <div className={styles.codingHeader}>
              <span className={styles.codingLabel}>
                第 {index + 1} 題 — {item.data.label}. {item.data.title}
                <Tag size="sm" type="green">程式題</Tag>
              </span>
              {item.data.score != null && (
                <span className={styles.codingScore}>{item.data.score} 分</span>
              )}
            </div>
            {problemDetails[item.data.problemId] ? (
              <ProblemPreview
                problem={problemDetails[item.data.problemId]}
                compact
              />
            ) : (
              <Loading withOverlay={false} small description="載入題目中..." />
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
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
        </div>
        <div className={styles.toolbarRight}>
          <ContentSwitcher
            size="sm"
            selectedIndex={viewMode === "single" ? 0 : 1}
            onChange={(e: { index: number }) =>
              setViewMode(e.index === 0 ? "single" : "all")
            }
          >
            <Switch name="single" text="逐題模式" />
            <Switch name="all" text="全題模式" />
          </ContentSwitcher>
        </div>
      </div>

      <div className={styles.body}>
        {viewMode === "single" && (
          <ExamNavigator
            items={items}
            activeIndex={activeIndex}
            answeredIds={answeredIds}
            onSelect={setActiveIndex}
          />
        )}
        {viewMode === "single" ? renderSingleMode() : renderAllMode()}
      </div>
    </div>
  );
};

export default StudentExamDemoScreen;
