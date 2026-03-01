import { Tile, Tag, Button, Layer } from "@carbon/react";
import { Renew } from "@carbon/icons-react";
import ContainerCard from "@/shared/layout/ContainerCard";
import { questionTypeLabel } from "./gradingTypes";
import type { QuestionProgress, GlobalStats } from "./gradingTypes";
import styles from "./ContestExamGrading.module.scss";

interface GradingOverviewTabProps {
  globalStats: GlobalStats;
  questionProgress: QuestionProgress[];
  published: boolean;
  onPublish: () => void;
  publishingResults: boolean;
  onRefresh: () => void;
}

export default function GradingOverviewTab({
  globalStats,
  questionProgress,
  published,
  onPublish,
  publishingResults,
  onRefresh,
}: GradingOverviewTabProps) {
  const subjectivePercent =
    globalStats.subjectiveTotal > 0
      ? Math.round(
          (globalStats.subjectiveGraded / globalStats.subjectiveTotal) * 100
        )
      : 100;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* KPI Tiles */}
      <div className={styles.kpiRow}>
        <Layer level={2}>
          <Tile className={styles.kpiTile}>
            <span className={styles.kpiLabel}>學生數</span>
            <span className={styles.kpiValue}>{globalStats.totalStudents}</span>
          </Tile>
        </Layer>
        <Layer level={2}>
          <Tile className={styles.kpiTile}>
            <span className={styles.kpiLabel}>題目數</span>
            <span className={styles.kpiValue}>{globalStats.totalQuestions}</span>
          </Tile>
        </Layer>
        <Layer level={2}>
          <Tile className={styles.kpiTile}>
            <span className={styles.kpiLabel}>已批改</span>
            <span className={styles.kpiValue}>{globalStats.gradedAnswers}</span>
          </Tile>
        </Layer>
        <Layer level={2}>
          <Tile className={styles.kpiTile}>
            <span className={styles.kpiLabel}>未批改（主觀題）</span>
            <span className={styles.kpiValue}>
              {globalStats.subjectiveTotal - globalStats.subjectiveGraded}
            </span>
          </Tile>
        </Layer>
      </div>

      {/* Two-column: Progress + Publish */}
      <div className={styles.overviewGrid}>
        {/* Progress per question */}
        <ContainerCard
          title="各題批改進度"
          action={
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Button
                kind="ghost"
                renderIcon={Renew}
                hasIconOnly
                iconDescription="重新整理"
                size="sm"
                onClick={onRefresh}
              />
            </div>
          }
        >
          <div className={styles.progressList}>
            {questionProgress.length === 0 ? (
              <div className={styles.emptyState} style={{ minHeight: "120px" }}>
                <span className={styles.emptyStateDesc}>尚無批改進度</span>
              </div>
            ) : (
              questionProgress.map((q) => {
                const color = q.isObjective
                  ? "var(--cds-support-success)"
                  : q.progressPercent === 100
                    ? "var(--cds-support-success)"
                    : q.progressPercent > 50
                      ? "var(--cds-support-info)"
                      : "var(--cds-support-warning)";
                return (
                  <div key={q.questionId} className={styles.progressItem}>
                    <span className={styles.progressLabel}>
                      Q{q.questionIndex}
                    </span>
                    <span className={styles.progressType}>
                      <Tag type={q.isObjective ? "green" : "blue"} size="sm">
                        {questionTypeLabel[q.questionType]}
                      </Tag>
                    </span>
                    <div className={styles.progressBarWrap}>
                      <div
                        className={styles.progressBarFill}
                        style={{
                          width: `${q.progressPercent}%`,
                          background: color,
                        }}
                      />
                    </div>
                    <span className={styles.progressPercent}>
                      {q.gradedCount}/{q.totalAnswers}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </ContainerCard>

        {/* Publish card */}
        <ContainerCard
          title="成績發布"
          action={
            <Tag type={published ? "green" : "gray"} size="sm">
              {published ? "已發布" : "未發布"}
            </Tag>
          }
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
            }}
          >
            <div>
              <p
                style={{
                  margin: 0,
                  fontSize: "0.875rem",
                  color: "var(--cds-text-primary)",
                }}
              >
                主觀題批改進度
              </p>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: "0.5rem",
                  marginTop: "0.25rem",
                }}
              >
                <span
                  style={{
                    fontSize: "2rem",
                    fontWeight: 600,
                    fontVariantNumeric: "tabular-nums",
                    color: "var(--cds-text-primary)",
                  }}
                >
                  {subjectivePercent}%
                </span>
                <span
                  style={{
                    fontSize: "0.8125rem",
                    color: "var(--cds-text-secondary)",
                  }}
                >
                  ({globalStats.subjectiveGraded}/{globalStats.subjectiveTotal})
                </span>
              </div>

              <div className={styles.progressBarWrap} style={{ marginTop: "0.5rem" }}>
                <div
                  className={styles.progressBarFill}
                  style={{
                    width: `${subjectivePercent}%`,
                    background:
                      subjectivePercent === 100
                        ? "var(--cds-support-success)"
                        : "var(--cds-support-info)",
                  }}
                />
              </div>
            </div>

            {subjectivePercent < 100 && (
              <p
                style={{
                  margin: 0,
                  fontSize: "0.8125rem",
                  color: "var(--cds-support-warning)",
                }}
              >
                仍有未批改的主觀題，建議完成批改後再發布。
              </p>
            )}

            <Button
              kind={published ? "secondary" : "primary"}
              size="md"
              disabled={publishingResults || published}
              onClick={onPublish}
            >
              {published ? "已發布" : "發布成績"}
            </Button>
          </div>
        </ContainerCard>
      </div>
    </div>
  );
}
