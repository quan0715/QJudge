import { useTabWithUrlParam } from "@/shared/hooks/useTabWithUrlParam";
import { Button, Dropdown, OverflowMenu, OverflowMenuItem } from "@carbon/react";
import { Add, ArrowRight, Filter } from "@carbon/icons-react";
import { cloneElement, isValidElement, useState, type ReactElement, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ContestParticipant } from "@/core/entities/contest.entity";
import { hasStartedExam } from "@/core/entities/contest.entity";

import AdminInsightRail, { PriorityEventsInsightCard, type InsightCardAction } from "@/features/contest/components/admin/AdminInsightRail";
import AdminSegmentedDashboard from "@/features/contest/components/admin/AdminSegmentedDashboard";

import { useContest, useContestAdmin } from "@/features/contest/contexts";

import { CountdownProgress } from "@/features/contest/components/CountdownProgress";

import ContestLogsScreen from "@/features/contest/screens/settings/ContestLogsScreen";
import type { AdminOverviewDashboardData } from "@/features/contest/screens/admin/panels/adminOverviewDashboard.model";

import { BlockHeader, DashboardBlock, DashboardContainer, DashboardTabBar, DashboardTabPanel, DashboardTabs, DashboardToolbar, MetricBlock } from "@/shared/components/dashboard";
import styles from "./AdminOverviewCommandCenter.module.scss";

interface AdminOverviewCommandCenterProps {
  header?: ReactNode;
  data: AdminOverviewDashboardData;
  overviewInfo?: {
    contestTypeLabel: string;
  };
  adminLoading?: boolean;
  gradingLoading?: boolean;
  antiCheatEnabled?: boolean;
  participants: ContestParticipant[];
  primary: ReactNode;
  questionStatsGallery?: ReactNode;
  submissionList?: ReactNode;
  standingsContent?: ReactNode;
  clarificationsContent?: ReactNode;
  resultOverview?: ReactNode;
  gradingAction?: InsightCardAction;
  onOpenAnnouncement?: () => void;
}

type DrilldownTabId =
  | "questionStats"
  | "submissions"
  | "standings"
  | "clarifications";

const isParticipantLive = (participant: ContestParticipant) =>
  participant.liveMonitoringOnline ||
  participant.connectionStatus === "live" ||
  participant.connectionStatus === "online";

const DATE_TIME_LABEL_REGEX = /^(\d{4}\/\d{2}\/\d{2})\s+(\d{2}:\d{2})$/;

interface ScheduleEndpoint {
  date: string;
  time?: string;
}

const normalizeScheduleLabels = (
  startLabel: string,
  endLabel: string,
): { start: ScheduleEndpoint; end: ScheduleEndpoint } => {
  const startMatch = startLabel.match(DATE_TIME_LABEL_REGEX);
  const endMatch = endLabel.match(DATE_TIME_LABEL_REGEX);
  if (!startMatch || !endMatch) {
    return { start: { date: startLabel }, end: { date: endLabel } };
  }

  const [, startDate, startTime] = startMatch;
  const [, endDate, endTime] = endMatch;
  const omitYear = startDate.slice(0, 4) === endDate.slice(0, 4);
  const formatDate = (date: string) => (omitYear ? date.slice(5) : date);

  return {
    start: { date: formatDate(startDate), time: startTime },
    end: { date: formatDate(endDate), time: endTime },
  };
};

const renderScheduleValue = ({ date, time }: ScheduleEndpoint) => (
  <span className={styles.scheduleValue}>
    <span>{date}</span>
    {time ? <span>{time}</span> : null}
  </span>
);

type FilterOption<TId extends string = string> = {
  id: TId;
  labelKey: string;
  defaultLabel: string;
};

const QUESTION_KIND_FILTERS: FilterOption[] = [
  { id: "all", labelKey: "adminOverview.command.filters.allQuestionTypes", defaultLabel: "全部題型" },
  { id: "single_choice", labelKey: "common:questionType.label.single_choice", defaultLabel: "單選題" },
  { id: "multiple_choice", labelKey: "common:questionType.label.multiple_choice", defaultLabel: "多選題" },
  { id: "true_false", labelKey: "common:questionType.label.true_false", defaultLabel: "是非題" },
  { id: "short_answer", labelKey: "common:questionType.label.short_answer", defaultLabel: "簡答題" },
  { id: "essay", labelKey: "common:questionType.label.essay", defaultLabel: "申論題" },
];

const SUBMISSION_STATUS_FILTERS: FilterOption[] = [
  { id: "all", labelKey: "submissions.allStatus", defaultLabel: "全部狀態" },
  { id: "AC", labelKey: "submissions.ac", defaultLabel: "通過 (AC)" },
  { id: "WA", labelKey: "submissions.wa", defaultLabel: "答案錯誤 (WA)" },
  { id: "TLE", labelKey: "submissions.tle", defaultLabel: "超時 (TLE)" },
  { id: "MLE", labelKey: "submissions.mle", defaultLabel: "記憶體超限 (MLE)" },
  { id: "RE", labelKey: "submissions.re", defaultLabel: "執行錯誤 (RE)" },
  { id: "CE", labelKey: "submissions.ce", defaultLabel: "編譯錯誤 (CE)" },
  { id: "pending", labelKey: "submissions.pending", defaultLabel: "等待中" },
  { id: "judging", labelKey: "submissions.judging", defaultLabel: "評測中" },
];

interface SubmissionListToolbarProps {
  statusFilter?: string;
  problemFilter?: string;
  onStatusFilterChange?: (value: string) => void;
  onProblemFilterChange?: (value: string) => void;
  hideEmbeddedToolbar?: boolean;
}
export default function AdminOverviewCommandCenter({
  header,
  data,
  overviewInfo,
  adminLoading = false,
  gradingLoading = false,
  participants,
  primary,
  questionStatsGallery,
  submissionList,
  standingsContent,
  clarificationsContent,
  resultOverview,
  gradingAction,
  onOpenAnnouncement,
}: AdminOverviewCommandCenterProps) {
  const { t } = useTranslation("contest");
  const { contest } = useContest();
  const { examEventsLoading } = useContestAdmin();
  const isCodingContest = contest?.contestType === "coding";
  const { activeKey: activePanelTab, setActiveKey: setActivePanelTab } = useTabWithUrlParam<DrilldownTabId>({
    param: "tab",
    keys: isCodingContest
      ? ["submissions", "standings", "clarifications"]
      : ["standings", "questionStats", "clarifications"],
    defaultKey: isCodingContest ? "submissions" : "standings",
  });
  const [questionStatsSearch, setQuestionStatsSearch] = useState("");
  const [questionStatsKindFilter, setQuestionStatsKindFilter] =
    useState<string>("all");
  const [submissionStatusFilter, setSubmissionStatusFilter] =
    useState("all");
  const [submissionProblemFilter, setSubmissionProblemFilter] =
    useState("all");

  const studentParticipants = participants.filter(hasStartedExam);
  const liveStudentCount = studentParticipants.filter(isParticipantLive).length;
  const insightCards = data.insightCards.filter(
    (card) => card.key !== "exam_progress",
  );
  const gradingInsightCards = insightCards.filter(
    (card) => card.key === "grading_progress",
  );
  const nonGradingInsightCards = insightCards.filter(
    (card) => card.key !== "grading_progress",
  );
  const priorityEventsCard = insightCards.find(
    (card) => card.key === "priority_events",
  );
  const scheduleLabels = normalizeScheduleLabels(
    data.timeline.startDateTimeLabel,
    data.timeline.endDateTimeLabel,
  );
  const contestInfoRow = (
    <DashboardContainer
      layout="grid"
      columns={4}
      dividers="auto"
      ariaLabel={t("adminOverview.command.contestInfo", "競賽基本資訊")}
    >
      <DashboardBlock>
        <MetricBlock
          label={t("adminOverview.command.metrics.contestType", "考卷題型")}
          value={overviewInfo?.contestTypeLabel ?? "—"}
        />
      </DashboardBlock>
      <DashboardBlock>
        <MetricBlock
          label={t(
            "adminOverview.command.metrics.currentStatus",
            "當前整體競賽狀態",
          )}
          value={data.timeline.phaseLabel}
        />
      </DashboardBlock>
      <div className={styles.scheduleGridItem}>
        <DashboardBlock
          ariaLabel={t("adminOverview.command.examTime", "考試時間")}
        >
          <div className={styles.scheduleBlock}>
            <div className={styles.scheduleEndpoint}>
              <MetricBlock
                label={t("adminOverview.command.metrics.startTime", "開始時間")}
                value={renderScheduleValue(scheduleLabels.start)}
              />
            </div>
            <ArrowRight
              className={styles.scheduleArrow}
              size={24}
              aria-hidden="true"
            />
            <div
              className={`${styles.scheduleEndpoint} ${styles.scheduleEndpointEnd}`}
            >
              <MetricBlock
                label={t("adminOverview.command.metrics.endTime", "結束時間")}
                value={renderScheduleValue(scheduleLabels.end)}
              />
            </div>
          </div>
        </DashboardBlock>
      </div>
    </DashboardContainer>
  );
  const examStatusSummary = (
    <DashboardContainer
      layout="stack"
      dividers="auto"
      ariaLabel={t("adminOverview.command.examStatusSummary", "考試狀態摘要")}
    >
      <DashboardContainer layout="grid" columns={2} dividers="auto">
        <DashboardBlock>
          <MetricBlock
            label={t("adminOverview.command.metrics.examParticipants", "考試人數")}
            value={studentParticipants.length}
          />
        </DashboardBlock>
        <DashboardBlock>
          <MetricBlock
            label={t("adminOverview.command.metrics.onlineParticipants", "在線人數")}
            value={liveStudentCount}
          />
        </DashboardBlock>
      </DashboardContainer>
      <DashboardBlock>
        {contest ? (
          <CountdownProgress
            startTime={contest.startTime}
            endTime={contest.endTime}
          />
        ) : null}
      </DashboardBlock>
    </DashboardContainer>
  );
  const questionStatsPanel = (
    <div className={styles.drilldownPanel}>
      {isValidElement(questionStatsGallery) && typeof questionStatsGallery.type !== "string"
        ? cloneElement(
            questionStatsGallery as ReactElement<{
              searchQuery?: string;
              onSearchQueryChange?: (q: string) => void;
              questionKindFilter?: string;
              onQuestionKindFilterChange?: (kind: string) => void;
              showFilterToolbar?: boolean;
              embedded?: boolean;
            }>,
            {
              searchQuery: questionStatsSearch,
              onSearchQueryChange: setQuestionStatsSearch,
              questionKindFilter: questionStatsKindFilter,
              onQuestionKindFilterChange: setQuestionStatsKindFilter,
              showFilterToolbar: false,
              embedded: true,
            },
          )
        : questionStatsGallery ?? (
        <div className={styles.emptyState}>
          {t(
            "adminOverview.command.questionStats.empty",
            "目前沒有作答分佈資料",
          )}
        </div>
      )}
    </div>
  );
  const questionStatsTabToolbar = (
    <DashboardToolbar>
      <DashboardToolbar.Search
        id="overview-question-stats-search"
        ariaLabel={t("adminOverview.command.questionStats.search", "搜尋題目")}
        placeholder={t(
          "adminOverview.command.questionStats.searchPlaceholder",
          "搜尋題號或題目...",
        )}
        value={questionStatsSearch}
        collapsible
        onChange={setQuestionStatsSearch}
        onClear={() => setQuestionStatsSearch("")}
      />
      <DashboardToolbar.Filter>
        <OverflowMenu
          renderIcon={Filter}
          iconDescription={t(
            "adminOverview.command.questionStats.filterQuestionType",
            "篩選題型",
          )}
          size="md"
          flipped
          aria-label={t(
            "adminOverview.command.questionStats.filterQuestionTypeAria",
            "篩選題型",
          )}
        >
          {QUESTION_KIND_FILTERS.map((option) => (
            <OverflowMenuItem
              key={option.id}
              itemText={
                questionStatsKindFilter === option.id
                  ? `✓  ${t(option.labelKey, option.defaultLabel)}`
                  : t(option.labelKey, option.defaultLabel)
              }
              onClick={() => setQuestionStatsKindFilter(option.id)}
            />
          ))}
        </OverflowMenu>
      </DashboardToolbar.Filter>
      </DashboardToolbar>
  );
  const submissionProblemFilters = [
    {
      id: "all",
      label: t("submissions.allProblems", "全部題目"),
    },
    ...(contest?.problems ?? []).map((problem) => ({
      id: problem.problemId,
      label: `${problem.label}. ${problem.title}`,
    })),
  ];
  const submissionStatusFilters = SUBMISSION_STATUS_FILTERS.map((option) => ({
    id: option.id,
    label: t(option.labelKey, option.defaultLabel),
  }));
  const submissionTabToolbar = (
    <DashboardToolbar>
      <div className={styles.submissionFilterGroup}>
        <Filter className={styles.submissionFilterIcon} aria-hidden="true" />
        <div className={styles.submissionFilters}>
          <Dropdown
            id="overview-submission-status-filter"
            titleText={t("submissions.statusLabel", "狀態")}
            hideLabel
            label={t("submissions.allStatus", "全部狀態")}
            items={submissionStatusFilters}
            itemToString={(item) => item?.label ?? ""}
            selectedItem={
              submissionStatusFilters.find(
                (option) => option.id === submissionStatusFilter,
              ) ?? submissionStatusFilters[0]
            }
            onChange={({ selectedItem }: { selectedItem?: { id: string; label: string } | null }) => {
              if (selectedItem) setSubmissionStatusFilter(selectedItem.id);
            }}
          />
          <Dropdown
            id="overview-submission-problem-filter"
            titleText={t("submissions.problemLabel", "題目")}
            hideLabel
            label={t("submissions.allProblems", "全部題目")}
            items={submissionProblemFilters}
            itemToString={(item) => item?.label ?? ""}
            selectedItem={
              submissionProblemFilters.find(
                (option) => option.id === submissionProblemFilter,
              ) ?? submissionProblemFilters[0]
            }
            onChange={({ selectedItem }: { selectedItem?: { id: string; label: string } | null }) => {
              if (selectedItem) setSubmissionProblemFilter(selectedItem.id);
            }}
          />
        </div>
      </div>
    </DashboardToolbar>
  );
  const submissionPanel = (
    <div className={styles.drilldownPanel}>
      {isValidElement(submissionList) && typeof submissionList.type !== "string"
        ? cloneElement(
            submissionList as ReactElement<SubmissionListToolbarProps>,
            {
              statusFilter: submissionStatusFilter,
              problemFilter: submissionProblemFilter,
              onStatusFilterChange: setSubmissionStatusFilter,
              onProblemFilterChange: setSubmissionProblemFilter,
              hideEmbeddedToolbar: true,
            },
          )
        : submissionList ?? (
            <div className={styles.emptyState}>
              {t("adminOverview.command.submissions.empty", "目前沒有提交紀錄")}
            </div>
          )}
    </div>
  );
  const standingsTabPanel = (
    <div className={styles.drilldownPanel}>
      {standingsContent ?? (
        <div className={styles.emptyState}>
          {t("adminOverview.command.standings.empty", "目前沒有排行榜資料")}
        </div>
      )}
    </div>
  );
  const clarificationsTabToolbar = onOpenAnnouncement ? (
    <DashboardToolbar>
      <DashboardToolbar.Filter>
        <Button
          kind="ghost"
          size="md"
          hasIconOnly
          renderIcon={Add}
          iconDescription={t(
            "adminOverview.command.clarifications.publishAnnouncement",
            "發布公告",
          )}
          onClick={onOpenAnnouncement}
        />
      </DashboardToolbar.Filter>
    </DashboardToolbar>
  ) : undefined;
  const drilldownTabs = isCodingContest
    ? [
        {
          id: "submissions",
          label: t("adminOverview.command.drilldown.submissions", "提交列表"),
        },
        {
          id: "standings",
          label: t("adminOverview.command.drilldown.standings", "排行榜"),
        },
      ]
    : [
        { id: "standings", label: t("adminOverview.command.drilldown.scoreMatrix", "成績總覽") },
        {
          id: "questionStats",
          label: t("adminOverview.command.drilldown.questionStats", "作答分佈"),
        },
      ];
  const drilldownPanel = (
    <DashboardBlock
      padding="flush"
      ariaLabel={t("adminOverview.command.drilldown.ariaLabel", "總覽資料切換")}
    >
      <DashboardTabs
        activeId={activePanelTab}
        onChange={(id) => setActivePanelTab(id as DrilldownTabId)}
      >
        <DashboardTabBar
          ariaLabel={t("adminOverview.command.drilldown.ariaLabel", "總覽資料切換")}
          tabs={[...drilldownTabs, { id: "clarifications", label: t("studentDashboard.tabs.clarifications", "公告與提問") }]}
          toolbar={
            activePanelTab === "questionStats"
                ? questionStatsTabToolbar
                : activePanelTab === "submissions"
                  ? submissionTabToolbar
                  : activePanelTab === "clarifications"
                    ? clarificationsTabToolbar
                : undefined
          }
        />
        {activePanelTab === "clarifications" ? (
          <DashboardTabPanel tabId="clarifications">
            <div className={styles.drilldownPanel}>{clarificationsContent}</div>
          </DashboardTabPanel>
        ) : null}
        {isCodingContest ? (
          <>
            <DashboardTabPanel tabId="submissions">
              {submissionPanel}
            </DashboardTabPanel>
            <DashboardTabPanel tabId="standings">
              {standingsTabPanel}
            </DashboardTabPanel>
          </>
        ) : (
          <>
            <DashboardTabPanel tabId="standings">{standingsTabPanel}</DashboardTabPanel>
            <DashboardTabPanel tabId="questionStats">{questionStatsPanel}</DashboardTabPanel>
          </>
        )}
      </DashboardTabs>
    </DashboardBlock>
  );
  return (
    <>
      <AdminSegmentedDashboard
        ariaLabel={t("adminOverview.command.ariaLabel", "教師管理總覽")}
        tabListAriaLabel={t(
          "adminOverview.command.tabsAriaLabel",
          "教師管理總覽分頁",
        )}
        header={header}
        primary={
          <div className={styles.leftOverviewColumn}>
            {contestInfoRow}
            {primary}
            {drilldownPanel}
          </div>
        }
        side={
          <DashboardContainer layout="stack" dividers="auto">
            {examStatusSummary}
            <AdminInsightRail
              cards={[]}
              distribution={data.distribution}
              showDistribution
              distributionLoading={adminLoading}
            />
            {contest?.contestType === "coding" ? (
              <DashboardBlock>
                <BlockHeader title={t("adminOverview.resultsPublication", "成績發布")} />
                {gradingAction ? (
                  <Button
                    kind={gradingAction.kind || "primary"}
                    onClick={gradingAction.onClick}
                    disabled={gradingAction.disabled || gradingAction.loading}
                  >
                    {gradingAction.loading ? gradingAction.loadingLabel : gradingAction.label}
                  </Button>
                ) : null}
              </DashboardBlock>
            ) : <AdminInsightRail
              cards={gradingInsightCards}
              loadingCardKeys={gradingLoading ? ["grading_progress"] : []}
              gradingAction={gradingAction}
            />}
            {resultOverview}
            <AdminInsightRail
              cards={nonGradingInsightCards}
              loadingCardKeys={[
                ...(adminLoading || examEventsLoading
                  ? ["priority_events"]
                  : []),
              ]}
            />
            <section
              className={styles.eventLogPanel}
              aria-label={t("adminOverview.command.eventLog", "事件紀錄")}
            >
              <PriorityEventsInsightCard
                card={priorityEventsCard}
                loading={adminLoading || examEventsLoading}
              />
              <ContestLogsScreen embedded />
            </section>
          </DashboardContainer>
        }
      />
    </>
  );
}
