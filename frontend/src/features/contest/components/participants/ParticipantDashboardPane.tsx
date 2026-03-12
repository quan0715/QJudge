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
  MenuButton,
  MenuItem,
  MenuItemDivider,
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
  Calendar,
  DocumentTasks,
  Download,
  Edit,
  Launch,
  Locked,
  Login,
  Logout,
  SendAlt,
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
} from "@/core/entities/contest.entity";
import AnswerDisplay from "@/features/contest/components/exam/AnswerDisplay";
import ExamVideoReviewModal from "@/features/contest/components/admin/ExamVideoReviewModal";
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
  canDeleteExamVideos: boolean;
  onOpenGrading: () => void;
  onRefreshEvents?: () => Promise<void> | void;
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

type PaperReportPayload = Extract<ParticipantDashboard["report"], { overviewRows: unknown[] }>;
type CodingReportPayload = Extract<ParticipantDashboard["report"], { problemGrid: unknown[] }>;

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
  canDeleteExamVideos,
  onOpenGrading,
  onRefreshEvents,
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
  const primaryAction =
    dashboard?.actions.canUnlock
      ? {
          label: t("participants.actions.unlock", "解除鎖定"),
          icon: Locked,
          onClick: onUnlock,
        }
      : dashboard?.actions.canReopenExam
        ? {
            label: t("participants.actions.reopen", "重新開放考試"),
            icon: DocumentTasks,
            onClick: onReopenExam,
          }
        : null;

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
    const trend = (dashboard.report as CodingReportPayload).trend;
    return Object.entries(trend.statusCounts).map(([group, value]) => ({
      group: group.toUpperCase(),
      value,
    }));
  }, [dashboard]);

  const cumulativeData = useMemo(() => {
    if (!dashboard || dashboard.contestType !== "coding") return [];
    const trend = (dashboard.report as CodingReportPayload).trend;
    return trend.cumulativeProgress.flatMap((point) => [
      { group: t("participantsDashboard.score", "分數"), date: point.createdAt, value: point.score },
      { group: t("participantsDashboard.solved", "解題"), date: point.createdAt, value: point.solved ?? 0 },
    ]);
  }, [dashboard, t]);

  if (!dashboard && !loading && !error) {
    return (
      <ContainerCard className={styles.pane}>
        <div className={styles.detailEmpty}>
          {t("participantsDashboard.selectPrompt", "選擇一位參賽者以查看個人作答、報告、事件與監控資訊")}
        </div>
      </ContainerCard>
    );
  }

  if (loading) {
    return (
      <ContainerCard className={styles.pane}>
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
      <ContainerCard className={styles.pane}>
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
  const paperReport =
    dashboard.contestType === "paper_exam"
      ? (dashboard.report as PaperReportPayload)
      : null;
  const codingReport =
    dashboard.contestType === "coding"
      ? (dashboard.report as CodingReportPayload)
      : null;
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
    <ContainerCard className={styles.pane} noPadding>
      {error ? (
        <InlineNotification
          kind="warning"
          lowContrast
          title={t("participantsDashboard.partialLoadWarning", "部分資料可能不是最新")}
          subtitle={error}
        />
      ) : null}

      <div className={styles.tabsWrapper}>
        <Tabs
          selectedIndex={selectedIndex}
          onChange={({ selectedIndex: nextIndex }) => {
            const safeIndex = typeof nextIndex === "number" ? nextIndex : 0;
            const nextDetail = availableDetails[safeIndex] ?? "overview";
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
                  <div className={styles.overviewPanel}>
                    {/* Profile header */}
                    <div className={styles.profileHeader}>
                      <div className={styles.listItemName}>
                        <span className={styles.primaryText}>
                          {participant.userDisplayName || participant.displayName || participant.nickname || participant.username}
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
                        {primaryAction ? (
                          <Button
                            kind="secondary"
                            size="sm"
                            renderIcon={primaryAction.icon}
                            onClick={primaryAction.onClick}
                          >
                            {primaryAction.label}
                          </Button>
                        ) : null}
                        <MenuButton
                          kind="tertiary"
                          size="sm"
                          label={t("participantsDashboard.moreActions", "更多操作")}
                          menuAlignment="bottom-end"
                        >
                          <MenuItem
                            label={t("participants.actions.edit", "編輯狀態")}
                            renderIcon={Edit}
                            onClick={onEditStatus}
                          />
                          <MenuItemDivider />
                          <MenuItem
                            label={t("participants.actions.download", "下載報告")}
                            renderIcon={Download}
                            onClick={onDownloadReport}
                          />
                          {dashboard.actions.canViewEvidence ? (
                            <MenuItem
                              label={t("participantsDashboard.openEvidence", "查看監控影片")}
                              renderIcon={View}
                              onClick={() => {
                                if (activeDetail !== "evidence") {
                                  onDetailChange("evidence");
                                }
                              }}
                            />
                          ) : null}
                          {dashboard.actions.canOpenGrading ? (
                            <MenuItem
                              label={t("participantsDashboard.openGrading", "前往批改")}
                              renderIcon={Launch}
                              onClick={onOpenGrading}
                            />
                          ) : null}
                          {dashboard.actions.canUnlock && !primaryAction ? (
                            <MenuItem
                              label={t("participants.actions.unlock", "解除鎖定")}
                              renderIcon={Locked}
                              onClick={onUnlock}
                            />
                          ) : null}
                          {dashboard.actions.canApproveTakeover ? (
                            <MenuItem
                              label={t("participantsDashboard.approveTakeover", "核可裝置接管")}
                              renderIcon={View}
                              onClick={onApproveTakeover}
                            />
                          ) : null}
                          {dashboard.actions.canReopenExam && !primaryAction ? (
                            <MenuItem
                              label={t("participants.actions.reopen", "重新開放考試")}
                              renderIcon={DocumentTasks}
                              onClick={onReopenExam}
                            />
                          ) : null}
                          <MenuItemDivider />
                          <MenuItem
                            kind="danger"
                            label={t("participants.actions.remove", "移除參賽者")}
                            renderIcon={TrashCan}
                            onClick={onRemoveParticipant}
                          />
                        </MenuButton>
                      </div>
                    </div>

                    {/* Metric cards */}
                    <OverviewDataCards
                      items={overviewItems.map((item) => ({
                        ...item,
                        tone: item.key === "violations" && participant.violationCount > 0 ? "warning" : "default",
                      }))}
                      mode="compact"
                    />

                    {/* Summary details */}
                    <div className={styles.sectionStack}>
                      <h5 className={styles.sectionTitle}>{t("participantsDashboard.participantSummary", "參賽者摘要")}</h5>
                      <div className={styles.summaryList}>
                        {[
                          { icon: UserMultiple, label: t("participantsDashboard.username", "使用者"), value: participant.username || "-" },
                          { icon: UserMultiple, label: t("participantsDashboard.displayName", "顯示名稱"), value: participant.userDisplayName || "-" },
                          { icon: UserMultiple, label: t("participantsDashboard.accountRole", "身份"), value: participant.accountRole ? t(`user.role.${participant.accountRole}`, participant.accountRole) : "-" },
                          {
                            icon: Login,
                            label: t("participantsDashboard.registrationIdentity", "註冊身份"),
                            value:
                              participant.authProvider && participant.authProvider !== "email"
                                ? t("participantsDashboard.registrationIdentitySso", "SSO")
                                : t("participantsDashboard.registrationIdentityOther", "其他"),
                          },
                          { icon: Calendar, label: t("participants.headers.joinedAt", "加入時間"), value: participant.joinedAt ? new Date(participant.joinedAt).toLocaleString() : "-" },
                          { icon: Login, label: t("participantsDashboard.startedAt", "開始作答"), value: participant.startedAt ? new Date(participant.startedAt).toLocaleString() : "-" },
                          { icon: Logout, label: t("participantsDashboard.leftAt", "最後離開"), value: participant.leftAt ? new Date(participant.leftAt).toLocaleString() : "-" },
                          { icon: SendAlt, label: t("participantsDashboard.submitReason", "交卷原因"), value: participant.submitReason || "-" },
                          { icon: Locked, label: t("participants.headers.lockReason", "鎖定原因"), value: participant.lockReason || "-" },
                        ].map(({ icon: Icon, label, value }) => (
                          <div key={label} className={styles.summaryDataRow}>
                            <div className={styles.summaryDataLabel}>
                              <Icon size={16} className={styles.summaryDataIcon} />
                              <span>{label}</span>
                            </div>
                            <span className={styles.summaryDataValue}>{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}

                {detail === "report" && paperReport ? (
                  <div className={styles.sectionStack}>
                    <h5 className={styles.sectionTitle}>{t("participantsDashboard.questionOverview", "題目總覽")}</h5>
                    <PaperQuestionOverviewTable
                      rows={paperReport.overviewRows.map((row) => {
                        const questionDetail = paperReport.questionDetails.find(
                          (detailRow) => detailRow.questionId === row.questionId,
                        );
                        return {
                          id: row.questionId,
                          index: row.index,
                          prompt: questionDetail?.prompt || `Q${row.index}`,
                          typeLabel: t(
                            `common:questionType.label.${row.questionType}`,
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

                    <h5 className={styles.sectionTitle}>{t("participantsDashboard.questionDetails", "逐題詳情")}</h5>
                    <div className={styles.questionList}>
                      {paperReport.questionDetails.map((row) => (
                        <div key={row.questionId} className={styles.questionItem}>
                          <div className={styles.questionHeader}>
                            <div>
                              <div className={styles.primaryText}>
                                Q{row.index} · {t(`common:questionType.label.${row.questionType}`, questionTypeLabel[row.questionType])}
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
                            <AnswerDisplay
                              questionType={row.questionType}
                              answerContent={row.answer}
                              options={row.options}
                              correctAnswer={row.correctAnswer}
                            />
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
                  </div>
                ) : null}

                {detail === "report" && codingReport ? (
                  <div className={styles.sectionStack}>
                    <h5 className={styles.sectionTitle}>{t("participantsDashboard.problemGrid", "題目成績摘要")}</h5>
                    <div className={styles.problemList}>
                      {codingReport.problemGrid.map((row: ParticipantCodingProblemRow) => (
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

                    <h5 className={styles.sectionTitle}>{t("participantsDashboard.problemDetails", "題目詳情")}</h5>
                    <div className={styles.problemList}>
                      {codingReport.problemDetails.map((row: ParticipantCodingProblemDetail) => (
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

                    <h5 className={styles.sectionTitle}>{t("participantsDashboard.trendCharts", "提交趨勢")}</h5>
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
                  </div>
                ) : null}

                {detail === "events" ? (
                  <ContestLogsScreen
                    embedded
                    userIdFilter={participant.userId}
                    eventFeed={dashboard?.eventFeed}
                    onRefresh={onRefreshEvents}
                  />
                ) : null}

                {detail === "evidence" && dashboard.contestType === "paper_exam" ? (
                  <div className={styles.sectionStack}>
                    <h5 className={styles.sectionTitle}>{t("participantsDashboard.evidenceSessions", "監控影片與轉檔狀態")}</h5>
                    <ExamVideoReviewModal
                      contestId={contestId}
                      open={activeDetail === "evidence"}
                      userIdFilter={participant.userId}
                      canDelete={canDeleteExamVideos}
                    />
                  </div>
                ) : null}

                {detail === "submissions" && dashboard.contestType === "coding" ? (
                  <div className={styles.sectionStack}>
                    <h5 className={styles.sectionTitle}>{t("participantsDashboard.submissionRecords", "提交紀錄")}</h5>
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
                  </div>
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
