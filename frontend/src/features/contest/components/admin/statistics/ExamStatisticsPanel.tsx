import { useRef, useCallback } from "react";
import { Loading } from "@carbon/react";
import WorkTreeShell from "@/features/contest/components/admin/examEditor/WorkTreeShell";
import QuestionStatisticsDetail from "./QuestionStatisticsDetail";
import { useExamStatistics } from "./useExamStatistics";
import styles from "./ExamStatisticsPanel.module.scss";

export default function ExamStatisticsPanel() {
  const { questionStats, loading } = useExamStatistics();
  const safeStats = questionStats ?? [];
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const scrollToQuestion = useCallback((questionId: string) => {
    const el = cardRefs.current.get(questionId);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  if (loading) {
    return (
      <div className={styles.placeholder}>
        <Loading withOverlay={false} />
      </div>
    );
  }

  if (safeStats.length === 0) {
    return (
      <div className={styles.placeholder}>
        <p>尚無題目資料</p>
      </div>
    );
  }

  return (
    <div className={styles.statisticsLayout}>
      <div className={styles.workTreePane}>
        <WorkTreeShell
          title="題目統計"
          hasItems={safeStats.length > 0}
          emptyState="尚無題目資料"
          footer={<span>{safeStats.length} 題</span>}
        >
          <div className={styles.questionList}>
            {safeStats.map((q) => (
              <button
                key={q.questionId}
                type="button"
                className={styles.questionItem}
                onClick={() => scrollToQuestion(q.questionId)}
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
      </div>

      <div className={styles.scrollPane}>
        {safeStats.map((q) => (
          <div
            key={q.questionId}
            className={styles.cardItem}
            ref={(el) => {
              if (el) cardRefs.current.set(q.questionId, el);
            }}
          >
            <QuestionStatisticsDetail stat={q} />
          </div>
        ))}
      </div>
    </div>
  );
}
