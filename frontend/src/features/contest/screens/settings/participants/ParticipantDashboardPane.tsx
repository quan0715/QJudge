import { useMemo, useState } from "react";
import {
  AreaChart,
  DonutChart,
} from "@carbon/charts-react";
import { ScaleTypes } from "@carbon/charts";
import "@carbon/charts-react/styles.css";
import {
  Button,
  InlineNotification,
  Pagination,
  SkeletonPlaceholder,
  SkeletonText,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Tag,
} from "@carbon/react";
import {
  ChartBar,
  DocumentTasks,
  Download,
  Edit,
  Launch,
  Locked,
  TrashCan,
  Trophy,
  UserMultiple,
  View,
  WarningAlt,
} from "@carbon/icons-react";
import { useTranslation } from "react-i18next";

import type {
  ParticipantCodingProblemDetail,
  ParticipantCodingProblemRow,
  ParticipantDashboard,
  ParticipantDashboardDetail,
  ParticipantDashboardStatus,
  ParticipantPaperQuestionDetail,
} from "@/core/entities/contest.entity";
import PaperQuestionOverviewTable from "@/features/contest/components/exam/PaperQuestionOverviewTable";
import ContestLogsScreen from "@/features/contest/screens/settings/ContestLogsScreen";
import { questionTypeLabel } from "@/features/contest/screens/settings/grading/gradingTypes";
import { useContestSubmissions } from "@/features/contest/hooks/useContestSubmissions";
import { OverviewDataCards } from "@/shared/ui/dataCard";
import ContainerCard from "@/shared/layout/ContainerCard";
import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";
import { useTheme } from "@/shared/ui/theme/ThemeContext";

import styles from "./ContestParticipantsDashboard.module.scss";

interface ParticipantDashboardPaneProps {
  contestId?: string;
  dashboard: ParticipantDashboard | null;
  loading: boolean;
  error: string;
  activeDetail: ParticipantDashboardDetail;
  onDetailChange: (detail: ParticipantDashboardDetail) => void;
  onDownloadReport: () => void;
  onEditStatus: () => void;
  onUnlock: () => void;
  onApproveTakeover: () => void;
  onReopenExam: () => void;
  onRemoveParticipant: () => void;
  onOpenEvidenceModal: () => void;
  onOpenGrading: () => void;
}

const toTagType = (status: ParticipantDashboardStatus | null | undefined) => {
  switch (status?.color) {
    case "green":
      return "green";
    case "red":
      return "red";
    case "cyan":
      return "cyan";
    case "warm-gray":
      return "warm-gray";
    default:
      return "cool-gray";
  }
};

const renderAnswerSummary = (
  detail: ParticipantPaperQuestionDetail,
  t: (key: string, defaultValue?: string) => string,
) => {
  const { questionType, answer, options, correctAnswer } = detail;
  if (questionType === "essay" || questionType === "short_answer") {
    return (
      <div className={styles.sectionStack}>
        <div>
          <div className={styles.secondaryText}>{t("participantsDashboard.answerLabel", "作答")}</div>
          <div className={styles.markdownBlock}>
            <MarkdownRenderer enableMath enableHighlight>
              {String(answer?.text || t("participantsDashboard.noAnswer", "未作答"))}
            </MarkdownRenderer>
          </div>
        </div>
        {correctAnswer ? (
          <div>
            <div className={styles.secondaryText}>
              {t("participantsDashboard.referenceAnswer", "參考答案")}
            </div>
            <div className={styles.markdownBlock}>
              <MarkdownRenderer enableMath enableHighlight>
                {String(correctAnswer)}
              </MarkdownRenderer>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  const selectedValues = Array.isArray(answer?.selected)
    ? answer.selected.map((item) => String(item))
    : answer?.selected != null
      ? [String(answer.selected)]
      : [];
  const correctValues = Array.isArray(correctAnswer)
    ? correctAnswer.map((item) => String(item))
    : correctAnswer != null
      ? [String(correctAnswer)]
      : [];

  return (
    <div className={styles.twoColGrid}>
      <div>
        <div className={styles.secondaryText}>{t("participantsDashboard.answerLabel", "作答")}</div>
        <div className={styles.inlineMeta}>
          {selectedValues.length > 0
            ? selectedValues.map((value) => <Tag key={value}>{value}</Tag>)
            : t("participantsDashboard.noAnswer", "未作答")}
        </div>
      </div>
      <div>
        <div className={styles.secondaryText}>{t("participantsDashboard.correctAnswer", "正確答案")}</div>
        <div className={styles.inlineMeta}>
          {correctValues.length > 0
            ? correctValues.map((value) => {
                const optionIndex = /^[A-Z]$/.test(value)
                  ? value.charCodeAt(0) - 65
                  : -1;
                const optionText =
                  optionIndex >= 0 && optionIndex < options.length
                    ? `${value}. ${options[optionIndex]}`
                    : value;
                return <Tag key={value} type="green">{optionText}</Tag>;
              })
            : "-"}
        </div>
      </div>
    </div>
  );
};

const ParticipantDashboardPane: React.FC<ParticipantDashboardPaneProps> = ({
  contestId,
  dashboard,
  loading,
  error,
  activeDetail,
  onDetailChange,
  onDownloadReport,
  onEditStatus,
  onUnlock,
  onApproveTakeover,
  onReopenExam,
  onRemoveParticipant,
  onOpenEvidenceModal,
  onOpenGrading,
}) => {
  const { t } = useTranslation("contest");
  const { theme } = useTheme();
  const [submissionsPage, setSubmissionsPage] = useState(1);
  const [submissionsPageSize, setSubmissionsPageSize] = useState(10);

  const availableDetails = useMemo(() => {
    if (!dashboard) return ["overview", "report", "events"] as ParticipantDashboardDetail[];
    if (dashboard.contestType === "paper_exam") {
      return ["overview", "report", "events", "evidence"] as ParticipantDashboardDetail[];
    }
    return ["overview", "report", "events", "submissions"] as ParticipantDashboardDetail[];
  }, [dashboard]);

  const selectedIndex = Math.max(availableDetails.indexOf(activeDetail), 0);
  const submissionsEnabled =
    dashboard?.contestType === "coding" && activeDetail === "submissions";

  const codingSubmissions = useContestSubmissions({
    contestId: contestId || "",
    page: submissionsPage,
    pageSize: submissionsPageSize,
    userId: dashboard?.participant.userId,
    enabled: submissionsEnabled,
  });

  const chartTheme = theme === "g100" || theme === "g90" ? theme : "g100";
  const donutData = useMemo(() => {
    if (!dashboard || dashboard.contestType !== "coding") return [];
    const trend = dashboard.report.trend;
    return Object.entries(trend.statusCounts).map(([group, value]) => ({
      group: group.toUpperCase(),
      value,
    }));
  }, [dashboard]);

  const cumulativeData = useMemo(() => {
    if (!dashboard || dashboard.contestType !== "coding") return [];
    return dashboard.report.trend.cumulativeProgress.flatMap((point) => [
      { group: t("participantsDashboard.score", "分數"), date: point.createdAt, value: point.score },
      { group: t("participantsDashboard.solved", "解題"), date: point.createdAt, value: point.solved ?? 0 },
    ]);
  }, [dashboard, t]);

  if (!dashboard && !loading && !error) {
    return (
      <ContainerCard title={t("participantsDashboard.detailTitle", "Participant Dashboard")} className={styles.pane}>
        <div className={styles.detailEmpty}>
          {t("participantsDashboard.selectPrompt", "選擇一位參賽者以查看個人作答、報告、事件與監控資訊")}
        </div>
      </ContainerCard>
    );
  }

  if (loading) {
    return (
      <ContainerCard title={t("participantsDashboard.detailTitle", "Participant Dashboard")} className={styles.pane}>
        <div className={styles.skeletonStack}>
          <SkeletonText heading width="40%" />
          <SkeletonText width="65%" />
          <div className={styles.overviewGrid}>
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className={styles.metricCard}>
                <SkeletonText width="50%" />
                <SkeletonText heading width="60%" />
              </div>
            ))}
          </div>
          <SkeletonPlaceholder style={{ width: "100%", height: 320 }} />
        </div>
      </ContainerCard>
    );
  }

  if (!dashboard) {
    return (
      <ContainerCard title={t("participantsDashboard.detailTitle", "Participant Dashboard")} className={styles.pane}>
        <InlineNotification
          kind="error"
          lowContrast
          title={t("participantsDashboard.loadFailed", "載入參賽者 dashboard 失敗")}
          subtitle={error}
        />
      </ContainerCard>
    );
  }

  const participant = dashboard.participant;
  const overviewItems =
    dashboard.contestType === "paper_exam"
      ? [
          {
            key: "score",
            label: t("participantsDashboard.totalScore", "總分"),
            value: `${dashboard.overview.totalScore} / ${dashboard.overview.maxScore}`,
            unit: t("participantsDashboard.pointsUnit", "分"),
            icon: ChartBar,
          },
          {
            key: "correctRate",
            label: t("participantsDashboard.correctRate", "正確率"),
            value: String(dashboard.overview.correctRate ?? 0),
            unit: "%",
            icon: UserMultiple,
          },
          {
            key: "gradedCount",
            label: t("participantsDashboard.gradedQuestions", "已批改題數"),
            value: `${dashboard.overview.gradedCount ?? 0} / ${dashboard.overview.totalQuestions ?? 0}`,
            unit: t("participantsDashboard.questionUnit", "題"),
            icon: DocumentTasks,
          },
          {
            key: "violations",
            label: t("participantsDashboard.violations", "違規"),
            value: String(participant.violationCount),
            unit: t("participantsDashboard.countUnit", "次"),
            icon: WarningAlt,
          },
        ]
      : [
          {
            key: "score",
            label: t("participantsDashboard.totalScore", "總分"),
            value: `${dashboard.overview.totalScore} / ${dashboard.overview.maxScore}`,
            unit: t("participantsDashboard.pointsUnit", "分"),
            icon: ChartBar,
          },
          {
            key: "solved",
            label: t("participantsDashboard.solved", "解題"),
            value: `${dashboard.overview.solved ?? 0} / ${dashboard.overview.totalProblems ?? 0}`,
            unit: t("participantsDashboard.questionUnit", "題"),
            icon: DocumentTasks,
          },
          {
            key: "rank",
            label: t("participantsDashboard.rank", "排名"),
            value:
              dashboard.overview.rank != null
                ? `#${dashboard.overview.rank} / ${dashboard.overview.totalParticipants ?? "-"}`
                : "-",
            icon: Trophy,
          },
          {
            key: "submissionRate",
            label: t("participantsDashboard.acceptedRate", "AC 比率"),
            value: `${dashboard.overview.acceptedSubmissions ?? 0} / ${dashboard.overview.effectiveSubmissions ?? 0}`,
            subtext: `${dashboard.overview.acceptedRate ?? 0}%`,
            icon: UserMultiple,
          },
        ];

  return (
    <ContainerCard
      title={t("participantsDashboard.detailTitle", "Participant Dashboard")}
      subtitle={t("participantsDashboard.detailSubtitle", "以 student report 為藍本的互動式檢視")}
      className={styles.pane}
    >
      {error ? (
        <InlineNotification
          kind="warning"
          lowContrast
          title={t("participantsDashboard.partialLoadWarning", "部分資料可能不是最新")}
          subtitle={error}
        />
      ) : null}

      <div className={styles.dashboardGrid}>
        <div className={styles.dashboardHeader}>
          <div className={styles.listItemName}>
            <span className={styles.primaryText}>
              {participant.displayName || participant.nickname || participant.username}
            </span>
            <span className={styles.secondaryText}>
              @{participant.username}
              {participant.email ? ` • ${participant.email}` : ""}
            </span>
            <div className={styles.inlineMeta}>
              <Tag type="blue">{t(`examStatus.${participant.examStatus}`, participant.examStatus)}</Tag>
              {participant.submitReason ? <Tag>{participant.submitReason}</Tag> : null}
              {participant.lockReason ? <Tag type="red">{participant.lockReason}</Tag> : null}
            </div>
          </div>

          <div className={styles.actionsRow}>
            <Button kind="ghost" size="sm" renderIcon={Download} onClick={onDownloadReport}>
              {t("participants.actions.download", "下載報告")}
            </Button>
            <Button kind="ghost" size="sm" renderIcon={Edit} onClick={onEditStatus}>
              {t("participants.actions.edit", "編輯狀態")}
            </Button>
            {dashboard.actions.canUnlock ? (
              <Button kind="ghost" size="sm" renderIcon={Locked} onClick={onUnlock}>
                {t("participants.actions.unlock", "解除鎖定")}
              </Button>
            ) : null}
            {dashboard.actions.canApproveTakeover ? (
              <Button kind="ghost" size="sm" renderIcon={View} onClick={onApproveTakeover}>
                {t("participantsDashboard.approveTakeover", "核可裝置接管")}
              </Button>
            ) : null}
            {dashboard.actions.canReopenExam ? (
              <Button kind="ghost" size="sm" renderIcon={DocumentTasks} onClick={onReopenExam}>
                {t("participants.actions.reopen", "重新開放考試")}
              </Button>
            ) : null}
            {dashboard.actions.canViewEvidence ? (
              <Button kind="ghost" size="sm" renderIcon={View} onClick={onOpenEvidenceModal}>
                {t("participantsDashboard.openEvidence", "查看監控影片")}
              </Button>
            ) : null}
            {dashboard.actions.canOpenGrading ? (
              <Button kind="ghost" size="sm" renderIcon={Launch} onClick={onOpenGrading}>
                {t("participantsDashboard.openGrading", "前往批改")}
              </Button>
            ) : null}
            <Button kind="danger--ghost" size="sm" renderIcon={TrashCan} onClick={onRemoveParticipant}>
              {t("participants.actions.remove", "移除參賽者")}
            </Button>
          </div>
        </div>

        <OverviewDataCards
          items={overviewItems.map((item) => ({
            ...item,
            tone: item.key === "violations" && participant.violationCount > 0 ? "warning" : "default",
          }))}
          mode="compact"
        />

        <Tabs
          className={styles.tabs}
          selectedIndex={selectedIndex}
          onChange={({ selectedIndex: nextIndex }) => {
            const nextDetail = availableDetails[nextIndex] ?? "overview";
            if (nextDetail === "submissions") {
              setSubmissionsPage(1);
              setSubmissionsPageSize(10);
            }
            onDetailChange(nextDetail);
          }}
        >
          <TabList contained aria-label={t("participantsDashboard.detailTabs", "參賽者資料分頁")}>
            {availableDetails.map((detail) => (
              <Tab key={detail}>
                {t(`participantsDashboard.tabs.${detail}`, detail)}
              </Tab>
            ))}
          </TabList>
          <TabPanels>
            {availableDetails.map((detail) => (
              <TabPanel key={detail} className={styles.tabPanel}>
                {detail === "overview" ? (
                  <div className={styles.sectionStack}>
                    <ContainerCard title={t("participantsDashboard.participantSummary", "參賽者摘要")} withLayer={false}>
                      <div className={styles.sectionStack}>
                        <div className={styles.summaryRow}>
                          <span className={styles.summaryLabel}>{t("participants.headers.joinedAt", "加入時間")}</span>
                          <span>{participant.joinedAt ? new Date(participant.joinedAt).toLocaleString() : "-"}</span>
                        </div>
                        <div className={styles.summaryRow}>
                          <span className={styles.summaryLabel}>{t("participantsDashboard.startedAt", "開始作答")}</span>
                          <span>{participant.startedAt ? new Date(participant.startedAt).toLocaleString() : "-"}</span>
                        </div>
                        <div className={styles.summaryRow}>
                          <span className={styles.summaryLabel}>{t("participantsDashboard.leftAt", "最後離開")}</span>
                          <span>{participant.leftAt ? new Date(participant.leftAt).toLocaleString() : "-"}</span>
                        </div>
                        <div className={styles.summaryRow}>
                          <span className={styles.summaryLabel}>{t("participantsDashboard.submitReason", "交卷原因")}</span>
                          <span>{participant.submitReason || "-"}</span>
                        </div>
                        <div className={styles.summaryRow}>
                          <span className={styles.summaryLabel}>{t("participants.headers.lockReason", "鎖定原因")}</span>
                          <span>{participant.lockReason || "-"}</span>
                        </div>
                      </div>
                    </ContainerCard>
                  </div>
                ) : null}

                {detail === "report" && dashboard.contestType === "paper_exam" ? (
                  <div className={styles.sectionStack}>
                    <ContainerCard title={t("participantsDashboard.questionOverview", "題目總覽")} withLayer={false}>
                      <PaperQuestionOverviewTable
                        rows={dashboard.report.overviewRows.map((row) => {
                          const questionDetail = dashboard.report.questionDetails.find(
                            (detailRow) => detailRow.questionId === row.questionId,
                          );
                          return {
                            id: row.questionId,
                            index: row.index,
                            prompt: questionDetail?.prompt || `Q${row.index}`,
                            typeLabel: t(
                              `questionTypes.${row.questionType}`,
                              questionTypeLabel[row.questionType],
                            ),
                            maxScore: row.maxScore,
                            scoreDisplay: row.score != null ? String(row.score) : "-",
                            statusLabel: row.status.label,
                            statusTone: toTagType(row.status),
                          };
                        })}
                        showScore
                      />
                    </ContainerCard>

                    <ContainerCard title={t("participantsDashboard.questionDetails", "逐題詳情")} withLayer={false}>
                      <div className={styles.questionList}>
                        {dashboard.report.questionDetails.map((row) => (
                          <div key={row.questionId} className={styles.questionItem}>
                            <div className={styles.questionHeader}>
                              <div>
                                <div className={styles.primaryText}>
                                  Q{row.index} · {t(`questionTypes.${row.questionType}`, questionTypeLabel[row.questionType])}
                                </div>
                                <div className={styles.secondaryText}>
                                  {row.score ?? "-"} / {row.maxScore}
                                  {row.gradedByUsername ? ` • ${row.gradedByUsername}` : ""}
                                </div>
                              </div>
                              <Tag type={toTagType(row.status)}>{row.status.label}</Tag>
                            </div>
                            <div className={styles.questionBody}>
                              <div className={styles.markdownBlock}>
                                <MarkdownRenderer enableMath enableHighlight>
                                  {row.prompt}
                                </MarkdownRenderer>
                              </div>
                              {renderAnswerSummary(row, t)}
                              {row.feedback ? (
                                <div>
                                  <div className={styles.secondaryText}>
                                    {t("participantsDashboard.feedback", "批改評語")}
                                  </div>
                                  <div className={styles.markdownBlock}>
                                    <MarkdownRenderer enableMath enableHighlight>
                                      {row.feedback}
                                    </MarkdownRenderer>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    </ContainerCard>
                  </div>
                ) : null}

                {detail === "report" && dashboard.contestType === "coding" ? (
                  <div className={styles.sectionStack}>
                    <ContainerCard title={t("participantsDashboard.problemGrid", "題目成績摘要")} withLayer={false}>
                      <div className={styles.problemList}>
                        {dashboard.report.problemGrid.map((row: ParticipantCodingProblemRow) => (
                          <div key={row.problemId} className={styles.problemItem}>
                            <div className={styles.problemHeader}>
                              <div>
                                <div className={styles.primaryText}>{row.label} · {row.title}</div>
                                <div className={styles.secondaryText}>
                                  {row.difficulty || "-"} • {t("participantsDashboard.tries", "提交次數")} {row.tries}
                                </div>
                              </div>
                              <div className={styles.inlineMeta}>
                                {row.status ? <Tag>{row.status}</Tag> : null}
                                <span>{row.score} / {row.maxScore}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ContainerCard>

                    <ContainerCard title={t("participantsDashboard.problemDetails", "題目詳情")} withLayer={false}>
                      <div className={styles.problemList}>
                        {dashboard.report.problemDetails.map((row: ParticipantCodingProblemDetail) => (
                          <div key={row.problemId} className={styles.problemItem}>
                            <div className={styles.problemHeader}>
                              <div>
                                <div className={styles.primaryText}>{row.label} · {row.title}</div>
                                <div className={styles.secondaryText}>
                                  {t("participantsDashboard.tries", "提交次數")} {row.tries}
                                  {row.time != null ? ` • ${t("participantsDashboard.solveTime", "通過時間")} ${row.time}m` : ""}
                                </div>
                              </div>
                              <div className={styles.inlineMeta}>
                                {row.status ? <Tag>{row.status}</Tag> : null}
                                <span>{row.score} / {row.maxScore}</span>
                              </div>
                            </div>
                            {row.bestSubmission ? (
                              <div className={styles.problemBody}>
                                <div className={styles.inlineMeta}>
                                  <span>
                                    {t("participantsDashboard.bestSubmission", "最佳提交")} #{row.bestSubmission.id}
                                  </span>
                                  <Tag type="green">{row.bestSubmission.status}</Tag>
                                  <span>{row.bestSubmission.language}</span>
                                  <span>{new Date(row.bestSubmission.createdAt).toLocaleString()}</span>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </ContainerCard>

                    <ContainerCard title={t("participantsDashboard.trendCharts", "提交趨勢")} withLayer={false}>
                      <div className={styles.chartGrid}>
                        <div className={styles.chartWrap}>
                          {donutData.length > 0 ? (
                            <DonutChart
                              data={donutData}
                              options={{
                                title: "",
                                donut: {
                                  center: {
                                    label: t("participantsDashboard.statusDistribution", "結果分佈"),
                                  },
                                },
                                height: "320px",
                                theme: chartTheme,
                                toolbar: { enabled: false },
                              }}
                            />
                          ) : (
                            <div className={styles.emptyState}>
                              {t("participantsDashboard.noSubmissionData", "尚無提交資料")}
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
                              {t("participantsDashboard.noTrendData", "尚無可視化趨勢資料")}
                            </div>
                          )}
                        </div>
                      </div>
                    </ContainerCard>
                  </div>
                ) : null}

                {detail === "events" ? (
                  <ContestLogsScreen embedded userIdFilter={participant.userId} />
                ) : null}

                {detail === "evidence" && dashboard.contestType === "paper_exam" ? (
                  <ContainerCard
                    title={t("participantsDashboard.evidenceSessions", "監控影片與轉檔狀態")}
                    action={
                      <Button kind="ghost" size="sm" renderIcon={View} onClick={onOpenEvidenceModal}>
                        {t("participantsDashboard.manageEvidence", "開啟影片管理")}
                      </Button>
                    }
                    withLayer={false}
                  >
                    <div className={styles.emptyState}>
                      {t("participantsDashboard.monitoringUseExistingUi", "此分頁沿用既有影片管理 UI，請點擊上方按鈕開啟。")}
                    </div>
                  </ContainerCard>
                ) : null}

                {detail === "submissions" && dashboard.contestType === "coding" ? (
                  <ContainerCard title={t("participantsDashboard.submissionRecords", "提交紀錄")} withLayer={false}>
                    <div className={styles.submissionList}>
                      {codingSubmissions.isLoading ? (
                        <div className={styles.skeletonStack}>
                          {[1, 2, 3].map((item) => (
                            <div key={item} className={styles.submissionItem}>
                              <SkeletonText heading width="40%" />
                              <SkeletonText width="80%" />
                            </div>
                          ))}
                        </div>
                      ) : (codingSubmissions.data?.results || []).length === 0 ? (
                        <div className={styles.emptyState}>
                          {t("participantsDashboard.noSubmissionData", "尚無提交資料")}
                        </div>
                      ) : (
                        (codingSubmissions.data?.results || []).map((submission) => (
                          <div key={submission.id} className={styles.submissionItem}>
                            <div className={styles.submissionHeader}>
                              <div>
                                <div className={styles.primaryText}>
                                  {submission.problemTitle || submission.problemId}
                                </div>
                                <div className={styles.secondaryText}>
                                  #{submission.id} • {submission.language}
                                </div>
                              </div>
                              <div className={styles.inlineMeta}>
                                <Tag type={submission.status === "AC" ? "green" : "cool-gray"}>
                                  {submission.status}
                                </Tag>
                                {submission.score != null ? <span>{submission.score}</span> : null}
                              </div>
                            </div>
                            <div className={styles.submissionBody}>
                              <div className={styles.inlineMeta}>
                                <span>{new Date(submission.createdAt).toLocaleString()}</span>
                                {submission.execTime != null ? <span>{submission.execTime} ms</span> : null}
                                {submission.memoryUsage != null ? <span>{submission.memoryUsage} KB</span> : null}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                    {(codingSubmissions.data?.count || 0) > submissionsPageSize ? (
                      <div className={styles.paginationWrap}>
                        <Pagination
                          page={submissionsPage}
                          pageSize={submissionsPageSize}
                          pageSizes={[10, 20, 50]}
                          totalItems={codingSubmissions.data?.count || 0}
                          backwardText={t("common.prevPage", "上一頁")}
                          forwardText={t("common.nextPage", "下一頁")}
                          itemsPerPageText={t("common.itemsPerPage", "每頁")}
                          onChange={({ page, pageSize }) => {
                            setSubmissionsPage(page);
                            setSubmissionsPageSize(pageSize);
                          }}
                        />
                      </div>
                    ) : null}
                  </ContainerCard>
                ) : null}
              </TabPanel>
            ))}
          </TabPanels>
        </Tabs>
      </div>
    </ContainerCard>
  );
};

export default ParticipantDashboardPane;
