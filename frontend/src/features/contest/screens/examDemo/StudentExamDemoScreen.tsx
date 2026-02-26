import { useState, useEffect, useCallback, useMemo } from "react";
import type { FC } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Button,
  ContentSwitcher,
  Switch,
  Tag,
  Loading,
} from "@carbon/react";
import { ArrowLeft, ArrowRight, ChevronLeft } from "@carbon/icons-react";
import { getContest } from "@/infrastructure/api/repositories";
import { getExamQuestions } from "@/infrastructure/api/repositories/examQuestions.repository";
import { getContestProblem } from "@/infrastructure/api/repositories/contestProblems.repository";
import { ProblemPreview, ProblemHeaderCard } from "@/shared/ui/problem";
import { ExamQuestionCard } from "../../components/exam/ExamQuestionCard";
import { ExamNavigator } from "../../components/exam/ExamNavigator";
import type { ExamItem, ExamViewMode } from "../../types/examDemo.types";
import type { ExamQuestion } from "@/core/entities/contest.entity";
import type { ContestDetail } from "@/core/entities/contest.entity";
import type { ProblemDetail } from "@/core/entities/problem.entity";
import styles from "./StudentExamDemoScreen.module.scss";

const StudentExamDemoScreen: FC = () => {
  const navigate = useNavigate();
  const { contestId } = useParams<{ contestId: string }>();

  const [contest, setContest] = useState<ContestDetail | null>(null);
  const [contestLoading, setContestLoading] = useState(true);
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

  // Fetch contest data (standalone, no ContestProvider)
  useEffect(() => {
    if (!contestId) return;
    setContestLoading(true);
    getContest(contestId)
      .then((c) => setContest(c ?? null))
      .catch(() => setContest(null))
      .finally(() => setContestLoading(false));
  }, [contestId]);

  // Fetch exam questions
  useEffect(() => {
    if (!contestId) return;
    setLoadingQuestions(true);
    getExamQuestions(contestId)
      .then(setExamQuestions)
      .catch(() => setExamQuestions([]))
      .finally(() => setLoadingQuestions(false));
  }, [contestId]);

  // Fetch problem detail for current coding problem in single mode
  const currentItem = items[activeIndex];
  useEffect(() => {
    if (!contestId || !currentItem || currentItem.kind !== "coding") return;
    const pid = currentItem.data.problemId;
    if (problemDetails[pid]) return;
    getContestProblem(contestId, currentItem.data.id).then((detail) => {
      if (detail) {
        setProblemDetails((prev) => ({ ...prev, [pid]: detail }));
      }
    });
  }, [contestId, currentItem, problemDetails]);

  // Pre-fetch all coding problem details for "all" mode
  useEffect(() => {
    if (viewMode !== "all" || !contestId) return;
    const codingItems = items.filter((i) => i.kind === "coding");
    for (const item of codingItems) {
      const pid = item.data.problemId;
      if (problemDetails[pid]) continue;
      getContestProblem(contestId, item.data.id).then((detail) => {
        if (detail) {
          setProblemDetails((prev) => ({ ...prev, [pid]: detail }));
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, contestId, items.length]);

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
    const isLast = activeIndex === items.length - 1;

    return (
      <div className={styles.singleContent}>
        <div className={styles.questionArea}>
          <div className={styles.questionInner}>
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

            {!isLast && (
              <div className={styles.nextPrompt}>
                <span className={styles.nextPromptText}>
                  準備好了嗎？
                </span>
                <Button
                  kind="ghost"
                  size="sm"
                  renderIcon={ArrowRight}
                  onClick={() => setActiveIndex((i) => i + 1)}
                >
                  前往第 {activeIndex + 2} 題
                </Button>
              </div>
            )}
          </div>
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
            disabled={isLast}
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
      {items.map((item, index) => (
        <div key={item.data.id} className={styles.allItem}>
          {item.kind === "question" ? (
            <ExamQuestionCard
              question={item.data}
              index={index}
              answer={answers[item.data.id]}
              onAnswerChange={handleAnswerChange}
            />
          ) : (
            <div className={styles.codingCard}>
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
          )}
        </div>
      ))}
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
