import i18n from "i18next";
import { useMemo } from "react";
import { AreaChart, DonutChart } from "@carbon/charts-react";
import { ScaleTypes } from "@carbon/charts";
import "@carbon/charts-react/styles.css";
import { Tag } from "@carbon/react";
import { useTranslation } from "react-i18next";

import type {
  ParticipantCodingProblemDetail,
  ParticipantDashboard,
  ParticipantDashboardStatus,
} from "@/core/entities/contest.entity";
import PaperQuestionOverviewTable from "@/features/contest/components/exam/PaperQuestionOverviewTable";
import PaperQuestionReportCard from "@/features/contest/components/exam/PaperQuestionReportCard";
import CodingAnswerRecords from "@/features/contest/components/studentDashboard/CodingAnswerRecords";
import { questionTypeLabel } from "@/features/contest/screens/settings/grading/gradingTypes";
import { formatScore } from "@/features/contest/utils/scoreFormat";
import { useTheme } from "@/shared/ui/theme/ThemeContext";

import styles from "./ContestParticipantsDashboard.module.scss";

type PaperReportPayload = Extract<ParticipantDashboard["report"], { overviewRows: unknown[] }>;
type CodingReportPayload = Extract<ParticipantDashboard["report"], { problemGrid: unknown[] }>;

const toTagType = (status: ParticipantDashboardStatus | null | undefined) => {
  switch (status?.color) {
    case "green":
    case "red":
    case "cyan":
    case "warm-gray":
      return status.color;
    default:
      return "cool-gray";
  }
};

interface ParticipantAnswerReportProps {
  contestId: string;
  dashboard: ParticipantDashboard;
  expandedProblemId?: string;
}

export default function ParticipantAnswerReport({
  contestId,
  dashboard,
  expandedProblemId,
}: ParticipantAnswerReportProps) {
  const { t } = useTranslation("contest");
  const { theme: chartTheme } = useTheme();
  const paperReport =
    dashboard.contestType === "paper_exam" ? (dashboard.report as PaperReportPayload) : null;
  const codingReport =
    dashboard.contestType === "coding" ? (dashboard.report as CodingReportPayload) : null;

  const donutData = useMemo(
    () =>
      codingReport
        ? Object.entries(codingReport.trend.statusCounts).map(([group, value]) => ({
            group: group.toUpperCase(),
            value,
          }))
        : [],
    [codingReport],
  );
  const cumulativeData = useMemo(
    () =>
      codingReport
        ? codingReport.trend.cumulativeProgress.flatMap((point) => [
            { group: t("dashboard.score", "分數"), date: point.createdAt, value: point.score },
            { group: t("dashboard.solved", "解題"), date: point.createdAt, value: point.solved ?? 0 },
          ])
        : [],
    [codingReport, t],
  );

  if (paperReport) {
    return (

          <div className={styles.sectionStack}>
            <h5 className={styles.sectionTitle}>
              {t("dashboard.questionOverview", "題目總覽")}
            </h5>
            <PaperQuestionOverviewTable
              rows={paperReport.overviewRows.map((row) => {
                const questionDetail = paperReport.questionDetails.find(
                  (detailRow) =>
                    detailRow.questionId === row.questionId,
                );
                return {
                  id: row.questionId,
                  index: row.index,
                  questionLabel: row.questionLabel,
                  prompt: questionDetail?.prompt || `${row.questionLabel ?? row.index}.`,
                  typeLabel: t(
                    `common:questionType.label.${row.questionType}`,
                    questionTypeLabel[row.questionType],
                  ),
	                          maxScore: row.maxScore,
	                          scoreDisplay:
	                            row.score != null ? formatScore(row.score) : "-",
                  statusLabel: row.status.label,
                  statusTone: toTagType(row.status),
                  scorePolicy: row.scorePolicy,
                };
              })}
              showScore
            />

            <h5 className={styles.sectionTitle}>
              {t("dashboard.questionDetails", "逐題詳情")}
            </h5>
            <div className={styles.questionList}>
              {paperReport.questionDetails.map((row) => (
                <PaperQuestionReportCard
                  key={row.questionId}
                  questionId={row.questionId}
                  index={row.index}
                  questionLabel={row.questionLabel}
                  questionType={row.questionType}
                  typeLabel={t(
                    `common:questionType.label.${row.questionType}`,
                    questionTypeLabel[row.questionType],
                  )}
                  prompt={row.prompt}
                  options={row.options}
                  answer={row.answer}
                  statusLabel={row.status.label}
                  statusTone={toTagType(row.status)}
                  showGrading
                  score={row.score}
                  maxScore={row.maxScore}
                  gradedByUsername={row.gradedByUsername}
                  feedback={row.feedback}
                  correctAnswer={row.correctAnswer}
                  explanation={row.explanation}
                  scorePolicy={row.scorePolicy}
                />
              ))}
            </div>
          </div>
    );
  }
  if (!codingReport) return null;
  return (
    <>

          <div className={styles.sectionStack}>
            <h5 className={styles.sectionTitle}>
              {t("dashboard.problemDetails", "題目詳情")}
            </h5>
            <div className={styles.problemList}>
              {codingReport.problemDetails.map(
                (row: ParticipantCodingProblemDetail) => (
                  <div
                    key={row.problemId}
                    className={styles.problemItem}
                  >
                    <div className={styles.problemHeader}>
                      <div>
                        <div className={styles.primaryText}>
                          {row.label} · {row.title}
                        </div>
                        <div className={styles.secondaryText}>
                          {t("dashboard.tries", "提交次數")} {row.tries}
                          {row.time != null
                            ? ` • ${t("dashboard.solveTime", "通過時間")} ${row.time}m`
                            : ""}
                        </div>
                      </div>
                      <div className={styles.inlineMeta}>
                        {row.status ? <Tag>{row.status}</Tag> : null}
                        <span>
	                                  {formatScore(row.score)} / {formatScore(row.maxScore)}
                        </span>
                      </div>
                    </div>
                    {row.bestSubmission ? (
                      <div className={styles.problemBody}>
                        <div className={styles.inlineMeta}>
                          <span>
                            {t("dashboard.bestSubmission", "最佳提交")}{" "}
                            #{row.bestSubmission.id}
                          </span>
                          <Tag type="green">
                            {row.bestSubmission.status}
                          </Tag>
                          <span>{row.bestSubmission.language}</span>
                          <span>
                            {new Date(
                              row.bestSubmission.createdAt,
                            ).toLocaleString(i18n.language || undefined)}
                          </span>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ),
              )}
            </div>

            <h5 className={styles.sectionTitle}>
              {t("dashboard.trendCharts", "提交趨勢")}
            </h5>
            <div className={styles.chartGrid}>
              <div className={styles.chartWrap}>
                {donutData.length > 0 ? (
                  <DonutChart
                    data={donutData}
                    options={{
                      title: "",
                      donut: {
                        center: {
                          label: t(
                            "dashboard.statusDistribution",
                            "結果分佈",
                          ),
                        },
                      },
                      height: "320px",
                      theme: chartTheme,
                      toolbar: { enabled: false },
                    }}
                  />
                ) : (
                  <div className={styles.emptyState}>
                    {t("dashboard.noSubmissionData", "尚無提交資料")}
                  </div>
                )}
              </div>
              <div className={styles.chartWrap}>
                {cumulativeData.length > 0 ? (
                  <AreaChart
                    data={cumulativeData}
                    options={{
                      title: "",
                      axes: {
                        bottom: {
                          mapsTo: "date",
                          scaleType: ScaleTypes.TIME,
                        },
                        left: {
                          mapsTo: "value",
                          scaleType: ScaleTypes.LINEAR,
                        },
                      },
                      curve: "curveMonotoneX",
                      height: "320px",
                      theme: chartTheme,
                      toolbar: { enabled: false },
                    }}
                  />
                ) : (
                  <div className={styles.emptyState}>
                    {t("dashboard.noTrendData", "尚無可視化趨勢資料")}
                  </div>
                )}
              </div>
            </div>
          </div>

          <CodingAnswerRecords
            key={dashboard.participant.userId}
            contestId={contestId}
            userId={dashboard.participant.userId}
            initialExpandedProblemId={expandedProblemId}
            problems={codingReport.problemGrid.map((problem) => ({
              id: problem.problemId,
              problemId: problem.problemId,
              label: problem.label,
              title: problem.title,
              userScore: problem.score,
              maxScore: problem.maxScore,
              userStatus: problem.status,
              submissionCount: problem.tries,
            }))}
          />
    </>
  );
}
