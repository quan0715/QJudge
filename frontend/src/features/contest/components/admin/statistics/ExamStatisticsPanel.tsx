import { useRef, useCallback, useEffect, useState } from "react";
import { Loading } from "@carbon/react";
import { useTranslation } from "react-i18next";
import WorkTreeShell from "@/features/contest/components/admin/examEditor/WorkTreeShell";
import AdminSplitLayout from "@/features/contest/components/admin/layout/AdminSplitLayout";
import QuestionStatisticsDetail from "./QuestionStatisticsDetail";
import { useExamStatistics } from "./useExamStatistics";
import { EmptyState } from "@/shared/ui/EmptyState";
import styles from "./ExamStatisticsPanel.module.scss";

export default function ExamStatisticsPanel() {
  const { t } = useTranslation("contest");
  const { questionStats, loading } = useExamStatistics();
  const safeStats = questionStats ?? [];
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const scrollPaneRef = useRef<HTMLDivElement>(null);
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);

  useEffect(() => {
    if (safeStats.length === 0) {
      setActiveQuestionId(null);
      return;
    }
    if (!activeQuestionId || !safeStats.some((q) => q.questionId === activeQuestionId)) {
      setActiveQuestionId(safeStats[0].questionId);
    }
  }, [safeStats, activeQuestionId]);

  const scrollToQuestion = useCallback((questionId: string) => {
    const el = cardRefs.current.get(questionId);
    const pane = scrollPaneRef.current;
    if (!el || !pane) return;
    setActiveQuestionId(questionId);

    const paneRect = pane.getBoundingClientRect();
    const cardRect = el.getBoundingClientRect();
    const safeMargin = 12;
    let delta = 0;

    if (cardRect.top < paneRect.top + safeMargin) {
      delta = cardRect.top - (paneRect.top + safeMargin);
    } else if (cardRect.bottom > paneRect.bottom - safeMargin) {
      delta = cardRect.bottom - (paneRect.bottom - safeMargin);
    }

    if (delta !== 0) {
      pane.scrollTo({
        top: pane.scrollTop + delta,
        behavior: "smooth",
      });
    }
  }, []);

  if (loading) {
    return (
      <EmptyState title="">
        <Loading withOverlay={false} />
      </EmptyState>
    );
  }

  if (safeStats.length === 0) {
    return <EmptyState title={t("statistics.noData", "尚無題目資料")} />;
  }

  const sidebarContent = (
    <WorkTreeShell
      title={t("statistics.title", "題目統計")}
      hasItems={safeStats.length > 0}
      emptyState={t("statistics.noData", "尚無題目資料")}
      footer={<span>{t("statistics.questionCount", { count: safeStats.length })}</span>}
    >
      <div className={styles.questionList}>
        {safeStats.map((q) => (
          <button
            key={q.questionId}
            type="button"
            className={`${styles.questionItem} ${
              activeQuestionId === q.questionId ? styles.questionItemActive : ""
            }`}
            onClick={() => scrollToQuestion(q.questionId)}
            aria-pressed={activeQuestionId === q.questionId}
          >
            <span className={styles.questionOrder}>Q{q.questionIndex}</span>
            <div className={styles.questionInfo}>
              <span className={styles.questionTitle}>
                {q.prompt || `Question ${q.questionIndex}`}
              </span>
              <span className={styles.questionMeta}>
                Avg {q.averageScore.toFixed(1)}/{q.maxScore}
              </span>
            </div>
          </button>
        ))}
      </div>
    </WorkTreeShell>
  );

  return (
    <AdminSplitLayout
      sidebar={sidebarContent}
      contentMaxWidth={760}
      ref={scrollPaneRef}
    >
      {safeStats.map((q) => (
        <div
          key={q.questionId}
          className={styles.cardItem}
          ref={(el) => {
            if (el) cardRefs.current.set(q.questionId, el);
            else cardRefs.current.delete(q.questionId);
          }}
        >
          <QuestionStatisticsDetail stat={q} />
        </div>
      ))}
    </AdminSplitLayout>
  );
}
