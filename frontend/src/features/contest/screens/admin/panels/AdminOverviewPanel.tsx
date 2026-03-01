import { useState } from "react";
import { Tile, Tag, Button, Layer, Loading } from "@carbon/react";
import { Renew } from "@carbon/icons-react";
import { useParams } from "react-router-dom";
import KpiCards from "@/features/contest/components/admin/KpiCards";
import ContainerCard from "@/shared/layout/ContainerCard";
import SurfaceSection from "@/shared/layout/SurfaceSection";
import { useContest } from "@/features/contest/contexts/ContestContext";
import { useToast } from "@/shared/contexts/ToastContext";
import { updateContest } from "@/infrastructure/api/repositories";
import { useGradingData } from "@/features/contest/screens/settings/grading/useGradingData";
import { questionTypeLabel } from "@/features/contest/screens/settings/grading/gradingTypes";
import type { DashboardKpi } from "../mockData";
import type { ContestDetail } from "@/core/entities/contest.entity";
import styles from "./AdminOverviewPanel.module.scss";

interface AdminOverviewPanelProps {
  kpi: DashboardKpi;
  contest: ContestDetail;
}

export default function AdminOverviewPanel({
  kpi,
  contest,
}: AdminOverviewPanelProps) {
  const { contestId } = useParams<{ contestId: string }>();
  const { refreshContest } = useContest();
  const { showToast } = useToast();
  const [publishingResults, setPublishingResults] = useState(false);

  const {
    globalStats,
    questionProgress,
    refreshData,
    loading,
  } = useGradingData();

  const published = !!contest.resultsPublished;

  const handlePublishResults = async () => {
    if (!contestId) return;
    setPublishingResults(true);
    try {
      await updateContest(contestId, { resultsPublished: true } as any);
      await refreshContest();
      showToast({ kind: "success", title: "成績已發布" });
    } catch {
      showToast({ kind: "error", title: "發布失敗" });
    } finally {
      setPublishingResults(false);
    }
  };

  const subjectivePercent =
    globalStats.subjectiveTotal > 0
      ? Math.round(
          (globalStats.subjectiveGraded / globalStats.subjectiveTotal) * 100
        )
      : 100;

  return (
    <>
      {/* Hero KPI */}
      <KpiCards kpi={kpi} contest={contest} isMockData />

      {/* Grading Overview */}
      <SurfaceSection maxWidth="1200px" style={{ padding: "1.5rem 2rem" }}>
        {loading ? (
          <div className={styles.loadingWrap}>
            <Loading withOverlay={false} small description="載入批改資料..." />
          </div>
        ) : (
          <div className={styles.gradingSection}>
            {/* Section header */}
            <div className={styles.sectionHeader}>
              <h3 className={styles.sectionTitle}>批改進度</h3>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Button
                  kind="ghost"
                  renderIcon={Renew}
                  hasIconOnly
                  iconDescription="重新整理"
                  size="sm"
                  onClick={refreshData}
                />
              </div>
            </div>

            {/* KPI row */}
            <div className={styles.statsRow}>
              <Layer level={2}>
                <Tile className={styles.statTile}>
                  <span className={styles.statLabel}>學生數</span>
                  <span className={styles.statValue}>{globalStats.totalStudents}</span>
                </Tile>
              </Layer>
              <Layer level={2}>
                <Tile className={styles.statTile}>
                  <span className={styles.statLabel}>題目數</span>
                  <span className={styles.statValue}>{globalStats.totalQuestions}</span>
                </Tile>
              </Layer>
              <Layer level={2}>
                <Tile className={styles.statTile}>
                  <span className={styles.statLabel}>已批改</span>
                  <span className={styles.statValue}>{globalStats.gradedAnswers}</span>
                </Tile>
              </Layer>
              <Layer level={2}>
                <Tile className={styles.statTile}>
                  <span className={styles.statLabel}>待批改（主觀題）</span>
                  <span className={styles.statValue}>
                    {globalStats.subjectiveTotal - globalStats.subjectiveGraded}
                  </span>
                </Tile>
              </Layer>
            </div>

            {/* Two-column: progress + publish */}
            <div className={styles.twoCol}>
              {/* Per-question progress */}
              <ContainerCard title="各題批改進度">
                <div className={styles.progressList}>
                  {questionProgress.map((q) => {
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
                  })}
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
                <div className={styles.publishContent}>
                  <div>
                    <p className={styles.publishLabel}>主觀題批改進度</p>
                    <div className={styles.publishBig}>
                      <span className={styles.publishPercent}>
                        {subjectivePercent}%
                      </span>
                      <span className={styles.publishSub}>
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
                    <p className={styles.publishWarning}>
                      仍有未批改的主觀題，建議完成批改後再發布。
                    </p>
                  )}

                  <Button
                    kind={published ? "secondary" : "primary"}
                    size="md"
                    disabled={publishingResults || published}
                    onClick={handlePublishResults}
                    style={{ alignSelf: "flex-start" }}
                  >
                    {published ? "已發布" : "發布成績"}
                  </Button>
                </div>
              </ContainerCard>
            </div>
          </div>
        )}
      </SurfaceSection>
    </>
  );
}
