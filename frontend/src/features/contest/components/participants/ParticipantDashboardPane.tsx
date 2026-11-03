import i18n from "i18next";
import { useMemo, type ComponentType, type ReactNode } from "react";
import {
  Button,
  InlineNotification,
  MenuButton,
  MenuItem,
  MenuItemDivider,
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
  Trophy,
  UserMultiple,
  WarningAlt,
} from "@carbon/icons-react";
import { useTranslation } from "react-i18next";

import type {
  ParticipantDashboard,
  ParticipantDashboardDetail,
} from "@/core/entities/contest.entity";
import { formatScore } from "@/features/contest/utils/scoreFormat";
import ParticipantAnswerReport from "./ParticipantAnswerReport";
import ContestLogsScreen from "@/features/contest/screens/settings/ContestLogsScreen";
import { OverviewDataCards } from "@/shared/ui/dataCard";
import ContainerCard from "@/shared/layout/ContainerCard";

import styles from "./ContestParticipantsDashboard.module.scss";

interface ParticipantDashboardPaneProps {
  contestId?: string;
  initialExpandedProblemId?: string;
  dashboard: ParticipantDashboard | null;
  loading: boolean;
  error: string;
  activeDetail: ParticipantDashboardDetail;
  hideOverviewTab?: boolean;
  overviewContent?: ReactNode;
  onDetailChange: (detail: ParticipantDashboardDetail) => void;
  onDownloadReport: () => void;
  onEditStatus: () => void;
  onUnlock: () => void;
  onReopenExam: () => void;
  onOpenGrading: () => void;
  onRefreshEvents?: () => Promise<void> | void;
}

const toExamStatusTagType = (examStatus: string | null | undefined) => {
  switch (examStatus) {
    case "submitted":
      return "green";
    case "in_progress":
      return "blue";
    case "paused":
      return "purple";
    case "locked":
      return "red";
    default:
      return "cool-gray";
  }
};

const TAB_ICON_BY_DETAIL: Partial<
  Record<
    ParticipantDashboardDetail,
    ComponentType<{ size?: number; className?: string }>
  >
> = {
  overview: UserMultiple,
  report: DocumentTasks,
  events: Calendar,
  submissions: SendAlt,
};

const ParticipantDashboardPane: React.FC<ParticipantDashboardPaneProps> = ({
  contestId,
  initialExpandedProblemId,
  dashboard,
  loading,
  error,
  activeDetail,
  hideOverviewTab = false,
  overviewContent,
  onDetailChange,
  onDownloadReport,
  onEditStatus,
  onUnlock,
  onReopenExam,
  onOpenGrading,
  onRefreshEvents,
}) => {
  const { t } = useTranslation("contest");

  const availableDetails = useMemo(() => {
    const details =
      !dashboard || dashboard.contestType === "paper_exam"
        ? (["overview", "report", "events"] as ParticipantDashboardDetail[])
        : (["overview", "report", "events"] as ParticipantDashboardDetail[]);
    return hideOverviewTab
      ? details.filter((detail) => detail !== "overview")
      : details;
  }, [dashboard, hideOverviewTab]);

  const selectedIndex = Math.max(availableDetails.indexOf(activeDetail), 0);
  const primaryAction = dashboard?.actions.canUnlock
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

  if (!dashboard && !loading && !error) {
    return (
      <ContainerCard
        className={`${styles.pane} ${styles.detailPaneCard}`}
        withLayer={false}
      >
        <div className={styles.detailEmpty}>
          {t(
            "dashboard.selectPrompt",
            "選擇一位參賽者以查看個人作答、報告、事件與監控資訊",
          )}
        </div>
      </ContainerCard>
    );
  }

  if (loading) {
    return (
      <ContainerCard
        className={`${styles.pane} ${styles.detailPaneCard}`}
        withLayer={false}
      >
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
      <ContainerCard
        className={`${styles.pane} ${styles.detailPaneCard}`}
        withLayer={false}
      >
        <InlineNotification
          kind="error"
          lowContrast
          title={t("dashboard.loadFailed", "載入參賽者 dashboard 失敗")}
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
	            label: t("dashboard.totalScore", "總分"),
	            value: `${formatScore(dashboard.overview.totalScore)} / ${formatScore(dashboard.overview.maxScore)}`,
            unit: t("dashboard.pointsUnit", "分"),
            icon: ChartBar,
          },
          {
            key: "correctRate",
            label: t("dashboard.correctRate", "正確率"),
            value: String(dashboard.overview.correctRate ?? 0),
            unit: "%",
            icon: UserMultiple,
          },
          {
            key: "gradedCount",
            label: t("dashboard.gradedQuestions", "已批改題數"),
            value: `${dashboard.overview.gradedCount ?? 0} / ${dashboard.overview.totalQuestions ?? 0}`,
            unit: t("dashboard.questionUnit", "題"),
            icon: DocumentTasks,
          },
          {
            key: "violations",
            label: t("dashboard.violations", "違規"),
            value: String(participant.violationCount),
            unit: t("dashboard.countUnit", "次"),
            icon: WarningAlt,
          },
        ]
      : [
	          {
	            key: "score",
	            label: t("dashboard.totalScore", "總分"),
	            value: `${formatScore(dashboard.overview.totalScore)} / ${formatScore(dashboard.overview.maxScore)}`,
            unit: t("dashboard.pointsUnit", "分"),
            icon: ChartBar,
          },
          {
            key: "solved",
            label: t("dashboard.solved", "解題"),
            value: `${dashboard.overview.solved ?? 0} / ${dashboard.overview.totalProblems ?? 0}`,
            unit: t("dashboard.questionUnit", "題"),
            icon: DocumentTasks,
          },
          {
            key: "rank",
            label: t("dashboard.rank", "排名"),
            value:
              dashboard.overview.rank != null
                ? `#${dashboard.overview.rank} / ${dashboard.overview.totalParticipants ?? "-"}`
                : "-",
            icon: Trophy,
          },
          {
            key: "submissionRate",
            label: t("dashboard.acceptedRate", "AC 比率"),
            value: `${dashboard.overview.acceptedSubmissions ?? 0} / ${dashboard.overview.effectiveSubmissions ?? 0}`,
            subtext: `${dashboard.overview.acceptedRate ?? 0}%`,
            icon: UserMultiple,
          },
        ];

  return (
    <ContainerCard
      className={`${styles.pane} ${styles.detailPaneCard}`}
      padding="none"
      withLayer={false}
    >
      {error ? (
        <InlineNotification
          kind="warning"
          lowContrast
          title={t("dashboard.partialLoadWarning", "部分資料可能不是最新")}
          subtitle={error}
        />
      ) : null}

      <div className={styles.tabsWrapper}>
        <Tabs
          selectedIndex={selectedIndex}
          onChange={({ selectedIndex: nextIndex }) => {
            const safeIndex = typeof nextIndex === "number" ? nextIndex : 0;
            const nextDetail = availableDetails[safeIndex] ?? "overview";
            onDetailChange(nextDetail);
          }}
        >
          <TabList
            className={styles.tabsList}
            aria-label={t("dashboard.detailTabs", "參賽者資料分頁")}
          >
            {availableDetails.map((detail) => {
              const Icon = TAB_ICON_BY_DETAIL[detail];
              return (
                <Tab key={detail} className={styles.detailTab}>
                  <span className={styles.tabLabel}>
                    {Icon ? (
                      <Icon size={16} className={styles.tabLabelIcon} />
                    ) : null}
                    <span>{t(`dashboard.tabs.${detail}`, detail)}</span>
                  </span>
                </Tab>
              );
            })}
          </TabList>
          <TabPanels>
            {availableDetails.map((detail) => (
              <TabPanel key={detail} className={styles.tabPanel}>
                {detail === "overview" && overviewContent
                  ? overviewContent
                  : null}
                {detail === "overview" && !overviewContent ? (
                  <div className={styles.overviewPanel}>
                    {/* Profile header */}
                    <div className={styles.profileHeader}>
                      <div className={styles.profileIdentity}>
                        <div className={styles.profileNameRow}>
                          <span className={styles.primaryText}>
                            {participant.displayName || participant.username}
                          </span>
                          <Tag
                            size="sm"
                            type={toExamStatusTagType(participant.examStatus)}
                          >
                            {t(
                              `examStatus.${participant.examStatus}`,
                              participant.examStatus,
                            )}
                          </Tag>
                        </div>
                        <span className={styles.secondaryText}>
                          @{participant.username}
                          {participant.email ? ` • ${participant.email}` : ""}
                        </span>
                        {participant.lockReason ? (
                          <div className={styles.profileStatusNotice}>
                            <span className={styles.profileStatusNoticeItem}>
                              {t("participants.headers.lockReason", "鎖定原因")}
                              ：{participant.lockReason}
                            </span>
                          </div>
                        ) : null}
                      </div>
                      <div className={styles.profileActions}>
                        {primaryAction ? (
                          <Button
                            kind="ghost"
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
                          label={t("dashboard.moreActions", "更多操作")}
                          menuAlignment="bottom-end"
                        >
                          <MenuItem
                            label={t("participants.actions.edit", "編輯狀態")}
                            renderIcon={Edit}
                            onClick={onEditStatus}
                          />
                          <MenuItemDivider />
                          <MenuItem
                            label={t(
                              "participants.actions.download",
                              "下載報告",
                            )}
                            renderIcon={Download}
                            onClick={onDownloadReport}
                          />
                          {dashboard.contestType === "paper_exam" && dashboard.actions.canOpenGrading ? (
                            <MenuItem
                              label={t("dashboard.openGrading", "前往批改")}
                              renderIcon={Launch}
                              onClick={onOpenGrading}
                            />
                          ) : null}
                          {dashboard.actions.canUnlock && !primaryAction ? (
                            <MenuItem
                              label={t(
                                "participants.actions.unlock",
                                "解除鎖定",
                              )}
                              renderIcon={Locked}
                              onClick={onUnlock}
                            />
                          ) : null}
                          {dashboard.actions.canReopenExam && !primaryAction ? (
                            <MenuItem
                              label={t(
                                "participants.actions.reopen",
                                "重新開放考試",
                              )}
                              renderIcon={DocumentTasks}
                              onClick={onReopenExam}
                            />
                          ) : null}
                        </MenuButton>
                      </div>
                    </div>

                    {/* Metrics bar */}
                    <OverviewDataCards
                      items={overviewItems.map((item) => ({
                        ...item,
                        tone:
                          item.key === "violations" &&
                          participant.violationCount > 0
                            ? "warning"
                            : "default",
                      }))}
                      mode="compact"
                      className={styles.metricsCards}
                    />

                    {/* Summary details */}
                    <div className={styles.sectionStack}>
                      <h5 className={styles.sectionTitle}>
                        {t("dashboard.participantSummary", "參賽者摘要")}
                      </h5>
                      <div className={styles.summaryList}>
                        {[
                          {
                            icon: UserMultiple,
                            label: t("dashboard.username", "使用者名稱"),
                            value: participant.username || "-",
                          },
                          {
                            icon: UserMultiple,
                            label: t("dashboard.displayName", "顯示名稱"),
                            value: participant.displayName || "-",
                          },
                          {
                            icon: UserMultiple,
                            label: t("dashboard.accountRole", "身份"),
                            value: participant.accountRole
                              ? t(
                                  `user.role.${participant.accountRole}`,
                                  participant.accountRole,
                                )
                              : "-",
                          },
                          {
                            icon: Login,
                            label: t(
                              "dashboard.registrationIdentity",
                              "註冊身份",
                            ),
                            value:
                              participant.authProvider &&
                              participant.authProvider !== "email"
                                ? t("dashboard.registrationIdentitySso", "SSO")
                                : t(
                                    "dashboard.registrationIdentityOther",
                                    "其他",
                                  ),
                          },
                          {
                            icon: Calendar,
                            label: t(
                              "participants.headers.joinedAt",
                              "加入時間",
                            ),
                            value: participant.joinedAt
                              ? new Date(participant.joinedAt).toLocaleString(i18n.language || undefined)
                              : "-",
                          },
                          {
                            icon: Login,
                            label: t("dashboard.startedAt", "開始作答"),
                            value: participant.startedAt
                              ? new Date(participant.startedAt).toLocaleString(i18n.language || undefined)
                              : "-",
                          },
                          {
                            icon: Logout,
                            label: t("dashboard.leftAt", "最後離開"),
                            value: participant.leftAt
                              ? new Date(participant.leftAt).toLocaleString(i18n.language || undefined)
                              : "-",
                          },
                          {
                            icon: SendAlt,
                            label: t("dashboard.submitReason", "交卷原因"),
                            value: participant.submitReason || "-",
                          },
                          {
                            icon: Locked,
                            label: t(
                              "participants.headers.lockReason",
                              "鎖定原因",
                            ),
                            value: participant.lockReason || "-",
                          },
                        ].map(({ icon: Icon, label, value }) => (
                          <div key={label} className={styles.summaryDataRow}>
                            <div className={styles.summaryDataLabel}>
                              <Icon
                                size={16}
                                className={styles.summaryDataIcon}
                              />
                              <span>{label}</span>
                            </div>
                            <span className={styles.summaryDataValue}>
                              {value}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}

                {detail === "report" ? (
                  <ParticipantAnswerReport
                    contestId={contestId ?? ""}
                    dashboard={dashboard}
                    expandedProblemId={initialExpandedProblemId}
                  />
                ) : null}

                {detail === "events" ? (
                  <ContestLogsScreen
                    embedded
                    userIdFilter={participant.userId}
                    eventFeed={dashboard?.eventFeed}
                    onRefresh={onRefreshEvents}
                  />
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
