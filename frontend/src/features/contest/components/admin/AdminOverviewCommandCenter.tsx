import {
  Button,
  FluidDropdown,
  ProgressBar,
  SelectableTag,
  SkeletonText,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  TableToolbarSearch,
  Tabs,
} from "@carbon/react";
import {
  CheckmarkFilled,
  CircleDash,
  Close,
  InProgress,
  Locked,
  PauseFilled,
  Time,
  WarningFilled,
} from "@carbon/icons-react";
import {
  useMemo,
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
  type ElementType,
  type ReactNode,
} from "react";
import type {
  ContestParticipant,
  ParticipantDashboardDetail,
} from "@/core/entities/contest.entity";
import AdminInsightRail, {
  PriorityEventsInsightCard,
} from "@/features/contest/components/admin/AdminInsightRail";
import AdminSegmentedDashboard from "@/features/contest/components/admin/AdminSegmentedDashboard";
import ParticipantDashboardPane from "@/features/contest/components/participants/ParticipantDashboardPane";
import ParticipantOperationsPane from "@/features/contest/components/participants/ParticipantOperationsPane";
import {
  EXAM_STATUS_LABELS,
  getExamStatusLabel,
} from "@/features/contest/constants/examLabels";
import type { AdminPanelId } from "@/features/contest/modules/types";
import useParticipantDashboard from "@/features/contest/screens/settings/participants/useParticipantDashboard";
import ContestLogsScreen from "@/features/contest/screens/settings/ContestLogsScreen";
import type {
  AdminOverviewDashboardData,
  AdminPreparationDashboardData,
} from "@/features/contest/screens/admin/panels/adminOverviewDashboard.model";
import { downloadParticipantReport } from "@/infrastructure/api/repositories";
import styles from "./AdminOverviewCommandCenter.module.scss";

interface AdminOverviewCommandCenterProps {
  data: AdminOverviewDashboardData;
  preparationData: AdminPreparationDashboardData;
  adminLoading?: boolean;
  gradingLoading?: boolean;
  contestId?: string;
  antiCheatEnabled?: boolean;
  onOpenPanel: (panel: AdminPanelId) => void;
  participants: ContestParticipant[];
  primary: ReactNode;
  questionStatsGallery?: ReactNode;
  resultOverview?: ReactNode;
}

const isStudentParticipant = (participant: ContestParticipant) =>
  !participant.accountRole || participant.accountRole === "student";

const displayName = (participant: ContestParticipant) =>
  participant.displayName ||
  participant.userDisplayName ||
  participant.username ||
  participant.userId;

const isParticipantLive = (participant: ContestParticipant) =>
  participant.liveMonitoringOnline ||
  participant.connectionStatus === "live" ||
  participant.connectionStatus === "online";

const getParticipantSortScore = (participant: ContestParticipant) => {
  let score = 0;
  if (participant.examStatus === "locked") score += 1000;
  if (participant.examStatus === "paused") score += 800;
  score += (participant.violationCount ?? 0) * 80;
  if (
    participant.examStatus === "in_progress" &&
    !isParticipantLive(participant)
  )
    score += 100;
  if (participant.connectionStatus === "offline") score += 60;
  if (participant.examStatus === "not_started") score += 20;
  return score;
};

const NEEDS_ATTENTION_STATUSES = new Set(["locked", "paused"]);
const STATUS_GROUP_ORDER = ["in_progress", "submitted", "not_started"];

const needsAttention = (participant: ContestParticipant) =>
  (participant.violationCount ?? 0) > 0 ||
  NEEDS_ATTENTION_STATUSES.has(participant.examStatus ?? "");

const getParticipantStatusIcon = (participant: ContestParticipant) => {
  if (participant.examStatus === "locked") return Locked;
  if (participant.examStatus === "paused") return PauseFilled;
  if (participant.examStatus === "submitted") return CheckmarkFilled;
  if (participant.examStatus === "in_progress") return InProgress;
  return CircleDash;
};

const getGroupIcon = (groupId: string) => {
  switch (groupId) {
    case "needs_attention":
      return WarningFilled;
    case "in_progress":
      return InProgress;
    case "submitted":
      return CheckmarkFilled;
    case "paused":
    case "locked":
      return PauseFilled;
    default:
      return Time;
  }
};

const getParticipantStatusLabel = (participant: ContestParticipant) =>
  getExamStatusLabel(participant.examStatus) ||
  EXAM_STATUS_LABELS[participant.examStatus] ||
  participant.examStatus;

const getStatusGroupLabel = (status: string) =>
  getExamStatusLabel(status as ContestParticipant["examStatus"]) ||
  EXAM_STATUS_LABELS[status as ContestParticipant["examStatus"]] ||
  status;

type ParticipantMetricKey =
  | "score"
  | "violations"
  | "answerProgress"
  | "gradingProgress";

interface ParticipantMetricDisplay {
  label: string;
  value: string;
  detail: string;
  tone: "neutral" | "danger";
  icon?: ElementType;
}

const PARTICIPANT_METRIC_OPTIONS: Array<{
  key: ParticipantMetricKey;
  label: string;
}> = [
  { key: "score", label: "分數" },
  { key: "violations", label: "違規" },
  { key: "answerProgress", label: "作答進度" },
  { key: "gradingProgress", label: "批改進度" },
];

type ParticipantStatusFilter =
  | "all"
  | "needs_attention"
  | NonNullable<ContestParticipant["examStatus"]>;

type FilterOption = {
  id: ParticipantStatusFilter;
  label: string;
};

const PARTICIPANT_STATUS_FILTERS: FilterOption[] = [
  { id: "all", label: "全部狀態" },
  { id: "needs_attention", label: "需要處理" },
  { id: "in_progress", label: "作答中" },
  { id: "submitted", label: "已交卷" },
  { id: "not_started", label: "未開始" },
  { id: "locked", label: "鎖定" },
  { id: "paused", label: "暫停" },
];

const getAnswerProgressMetric = (participant: ContestParticipant) => {
  switch (participant.examStatus) {
    case "submitted":
      return { value: "100%", detail: "已交卷" };
    case "in_progress":
      return { value: "進行中", detail: "作答中" };
    case "locked":
      return { value: "中斷", detail: "已鎖定" };
    case "paused":
      return { value: "暫停", detail: "已暫停" };
    default:
      return { value: "0%", detail: "未開始" };
  }
};

const getGradingProgressMetric = (participant: ContestParticipant) => {
  if (participant.examStatus === "submitted") {
    return { value: "已計分", detail: `${participant.score ?? 0} 分` };
  }
  return { value: "未交卷", detail: getParticipantStatusLabel(participant) };
};

const getParticipantMetric = (
  participant: ContestParticipant,
  metric: ParticipantMetricKey,
): ParticipantMetricDisplay => {
  if (metric === "violations") {
    return {
      label: "違規",
      value: String(participant.violationCount ?? 0),
      detail: "次",
      tone: (participant.violationCount ?? 0) > 0 ? "danger" : "neutral",
    };
  }
  if (metric === "answerProgress") {
    return {
      label: "作答進度",
      ...getAnswerProgressMetric(participant),
      tone:
        participant.examStatus === "locked" ||
        participant.examStatus === "paused"
          ? "danger"
          : "neutral",
      icon: getParticipantStatusIcon(participant),
    };
  }
  if (metric === "gradingProgress") {
    return {
      label: "批改進度",
      ...getGradingProgressMetric(participant),
      tone: "neutral",
    };
  }
  return {
    label: "分數",
    value: String(participant.score ?? 0),
    detail: "分",
    tone: "neutral",
  };
};

export default function AdminOverviewCommandCenter({
  data,
  preparationData,
  adminLoading = false,
  gradingLoading = false,
  contestId,
  antiCheatEnabled = false,
  onOpenPanel,
  participants,
  primary,
  questionStatsGallery,
  resultOverview,
}: AdminOverviewCommandCenterProps) {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [participantMetric, setParticipantMetric] =
    useState<ParticipantMetricKey>("score");
  const [participantSearch, setParticipantSearch] = useState("");
  const [participantStatusFilter, setParticipantStatusFilter] =
    useState<ParticipantStatusFilter>("all");
  const [activePanelTab, setActivePanelTab] = useState(0);
  const [activeParticipantDetail, setActiveParticipantDetail] =
    useState<ParticipantDashboardDetail>("overview");
  const participantDashboard = useParticipantDashboard(
    contestId,
    selectedUserId,
  );

  useEffect(() => {
    setActiveParticipantDetail("overview");
  }, [selectedUserId]);

  useEffect(() => {
    if (!selectedUserId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedUserId(null);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selectedUserId]);

  const handleDownloadParticipantReport = useCallback(async () => {
    if (!contestId || !selectedUserId) return;
    try {
      await downloadParticipantReport(contestId, selectedUserId);
    } catch (error) {
      console.error("Download participant report failed:", error);
    }
  }, [contestId, selectedUserId]);

  const openParticipantsPanel = useCallback(() => {
    onOpenPanel("participants");
  }, [onOpenPanel]);

  const studentParticipants = participants
    .filter(isStudentParticipant)
    .sort(
      (left, right) =>
        getParticipantSortScore(right) - getParticipantSortScore(left) ||
        displayName(left).localeCompare(displayName(right), "zh-TW"),
    );
  const filteredStudentParticipants = useMemo(() => {
    const normalizedQuery = participantSearch.trim().toLowerCase();
    return studentParticipants.filter((participant) => {
      if (participantStatusFilter === "needs_attention") {
        if (!needsAttention(participant)) return false;
      } else if (
        participantStatusFilter !== "all" &&
        participant.examStatus !== participantStatusFilter
      ) {
        return false;
      }
      if (!normalizedQuery) return true;
      return [
        displayName(participant),
        participant.username,
        participant.email,
        participant.lockReason,
        participant.submitReason,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery));
    });
  }, [participantSearch, participantStatusFilter, studentParticipants]);
  const participantsNeedingAttention =
    filteredStudentParticipants.filter(needsAttention);
  const normalParticipantsByStatus = filteredStudentParticipants
    .filter((participant) => !needsAttention(participant))
    .reduce<Record<string, ContestParticipant[]>>((groups, participant) => {
      const status = participant.examStatus ?? "unknown";
      groups[status] = groups[status] ?? [];
      groups[status].push(participant);
      return groups;
    }, {});
  const statusGroupKeys = [
    ...STATUS_GROUP_ORDER.filter(
      (status) => normalParticipantsByStatus[status]?.length,
    ),
    ...Object.keys(normalParticipantsByStatus)
      .filter((status) => !STATUS_GROUP_ORDER.includes(status))
      .sort(),
  ];
  const participantGroups = [
    ...(participantsNeedingAttention.length > 0
      ? [
          {
            id: "needs_attention",
            title: "需要處理",
            participants: participantsNeedingAttention,
          },
        ]
      : []),
    ...statusGroupKeys.map((status) => ({
      id: status,
      title: getStatusGroupLabel(status),
      participants: normalParticipantsByStatus[status],
    })),
  ];
  const liveStudentCount = studentParticipants.filter(isParticipantLive).length;
  const selectedStatusFilter =
    PARTICIPANT_STATUS_FILTERS.find(
      (item) => item.id === participantStatusFilter,
    ) ?? PARTICIPANT_STATUS_FILTERS[0];
  const handleParticipantSearchChange = (
    event: "" | ChangeEvent<HTMLInputElement>,
  ) => {
    if (event === "") {
      setParticipantSearch("");
      return;
    }
    setParticipantSearch(event.target.value);
  };
  const participantMetricTags = (
    <div className={styles.metricTagGroup} aria-label="考生卡片資料切換">
      {PARTICIPANT_METRIC_OPTIONS.map((option) => (
        <SelectableTag
          key={option.key}
          id={`participant-metric-${option.key}`}
          text={option.label}
          selected={participantMetric === option.key}
          onChange={() => setParticipantMetric(option.key)}
          size="sm"
        />
      ))}
    </div>
  );
  const insightCards = data.insightCards.filter(
    (card) => card.key !== "exam_progress",
  );
  const priorityEventsCard = insightCards.find(
    (card) => card.key === "priority_events",
  );
  const examProgressPercent = Math.round(
    Math.max(0, Math.min(100, data.timeline.progressPercent)),
  );
  const examStatusSummary = (
    <section className={styles.examStatusPanel} aria-label="考試狀態摘要">
      <div className={styles.examStatusMatrix}>
        <div className={styles.examStatusMetric}>
          <span>考試人數</span>
          <strong>{studentParticipants.length}</strong>
        </div>
        <div className={styles.examStatusMetric}>
          <span>在線人數</span>
          <strong>{liveStudentCount}</strong>
        </div>
      </div>
      <div className={styles.examScheduleGrid} aria-label="考試時間">
        <div className={styles.examScheduleItem}>
          <span>開始時間</span>
          <strong>{data.timeline.startDateTimeLabel}</strong>
        </div>
        <div className={styles.examScheduleItem}>
          <span>結束時間</span>
          <strong>{data.timeline.endDateTimeLabel}</strong>
        </div>
      </div>
      <div className={styles.examProgressBlock}>
        <div className={styles.examProgressHeader}>
          <span>倒數計時</span>
          <strong>{data.timeline.primaryTimeLabel}</strong>
        </div>
        <ProgressBar
          label="考試進度"
          hideLabel
          size="small"
          value={examProgressPercent}
        />
      </div>
    </section>
  );
  const selectedParticipant = selectedUserId
    ? participants.find((participant) => participant.userId === selectedUserId)
    : null;
  const liveParticipantDashboard =
    participantDashboard.data && selectedParticipant
      ? {
          ...participantDashboard.data,
          participant: {
            ...participantDashboard.data.participant,
            ...selectedParticipant,
            startedAt: participantDashboard.data.participant.startedAt,
            leftAt: participantDashboard.data.participant.leftAt,
            lockedAt: participantDashboard.data.participant.lockedAt,
          },
        }
      : participantDashboard.data;
  const participantOverviewContent = (
    <ParticipantOperationsPane
      dashboard={liveParticipantDashboard}
      loading={participantDashboard.loading}
      error={participantDashboard.error}
      onDownloadReport={() => void handleDownloadParticipantReport()}
      onEditStatus={openParticipantsPanel}
      onUnlock={openParticipantsPanel}
      onReopenExam={openParticipantsPanel}
      onOpenDetail={setActiveParticipantDetail}
      onOpenGrading={() => onOpenPanel("grading")}
      onOpenProctoring={() => onOpenPanel("proctoring")}
      showViolationKpi={antiCheatEnabled}
    />
  );
  const participantContent = adminLoading ? (
    <div className={styles.participantGridSections} aria-label="考生列表載入中">
      {Array.from({ length: 8 }).map((_, index) => (
        <div className={styles.participantCard} key={index}>
          <SkeletonText heading width="60%" />
          <SkeletonText width="42%" />
          <SkeletonText width="5rem" />
        </div>
      ))}
    </div>
  ) : filteredStudentParticipants.length === 0 ? (
    <div className={styles.emptyState}>目前沒有考生</div>
  ) : (
    <div className={styles.participantGridSections}>
      {participantGroups.map((group) => {
        const GroupIcon = getGroupIcon(group.id);
        return (
          <section key={group.id} className={styles.participantGroup}>
            <div
              className={`${styles.participantGroupHeader} ${
                group.id === "needs_attention"
                  ? styles.participantGroupHeaderAttention
                  : ""
              }`}
            >
              <GroupIcon size={16} />
              <span>{group.title}</span>
              <strong>{group.participants.length}</strong>
            </div>
            <div className={styles.participantGrid}>
              {group.participants.map((participant) => {
                const live = isParticipantLive(participant);
                const metric = getParticipantMetric(
                  participant,
                  participantMetric,
                );
                const MetricIcon = metric.icon;
                return (
                  <button
                    key={participant.userId}
                    type="button"
                    className={styles.participantCard}
                    onClick={() => setSelectedUserId(participant.userId)}
                  >
                    <div className={styles.participantCardHeader}>
                      <div className={styles.participantIdentity}>
                        <strong>{displayName(participant)}</strong>
                        <span>@{participant.username}</span>
                        <span className={styles.participantConnection}>
                          <span
                            className={
                              live ? styles.liveDot : styles.offlineDot
                            }
                            aria-label={live ? "在線" : "離線"}
                          />
                          {live ? "在線" : "離線"}
                        </span>
                      </div>
                      <div
                        className={`${styles.participantSingleMetric} ${
                          metric.tone === "danger" ? styles.metricDanger : ""
                        }`}
                      >
                        <span>{metric.label}</span>
                        <strong>
                          {MetricIcon ? <MetricIcon size={16} /> : null}
                          {metric.value}
                        </strong>
                        {metric.detail ? <small>{metric.detail}</small> : null}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
  const participantPanel = (
    <div className={styles.drilldownPanel}>
      <div className={styles.panelHeader}>
        <div>
          <h3>考生列表</h3>
          <p>依異常程度排序，快速掃描考生狀態。</p>
        </div>
        <Button kind="ghost" onClick={() => onOpenPanel("participants")}>
          查看全部
        </Button>
      </div>
      {participantMetricTags}
      {participantContent}
    </div>
  );
  const participantTabToolbar = (
    <div className={styles.tabRowToolbar}>
      <TableToolbarSearch
        id="overview-participants-search"
        labelText="搜尋考生"
        placeholder="搜尋姓名、帳號或狀態"
        value={participantSearch}
        onChange={handleParticipantSearchChange}
        persistent
        size="md"
      />
      <FluidDropdown
        id="overview-participants-status-filter"
        titleText="狀態"
        label="狀態"
        items={PARTICIPANT_STATUS_FILTERS}
        itemToString={(item: FilterOption | null) => item?.label ?? ""}
        selectedItem={selectedStatusFilter}
        onChange={({ selectedItem }) =>
          setParticipantStatusFilter(
            (selectedItem as FilterOption | null)?.id ?? "all",
          )
        }
        size="md"
      />
    </div>
  );
  const questionStatsPanel = (
    <div className={`${styles.drilldownPanel} ${styles.drilldownPanelFlush}`}>
      {questionStatsGallery ?? (
        <div className={styles.emptyState}>目前沒有作答分佈資料</div>
      )}
    </div>
  );
  const drilldownPanel = (
    <section className={styles.panelGrid} aria-label="總覽資料切換">
      <Tabs
        selectedIndex={activePanelTab}
        onChange={({ selectedIndex }) => setActivePanelTab(selectedIndex)}
      >
        <div className={styles.tabRow}>
          <TabList aria-label="總覽資料切換">
            <Tab>參與者</Tab>
            <Tab>作答分佈</Tab>
          </TabList>
          {activePanelTab === 0 ? participantTabToolbar : null}
        </div>
        <TabPanels>
          <TabPanel className={styles.drilldownTabPanel}>
            {participantPanel}
          </TabPanel>
          <TabPanel className={styles.drilldownTabPanel}>
            {questionStatsPanel}
          </TabPanel>
        </TabPanels>
      </Tabs>
    </section>
  );
  return (
    <>
      <AdminSegmentedDashboard
        ariaLabel="教師管理總覽"
        primary={
          <div className={styles.leftOverviewColumn}>
            {primary}
            {drilldownPanel}
          </div>
        }
        side={
          <div className={styles.rightOverviewColumn}>
            {examStatusSummary}
            {resultOverview}
            <AdminInsightRail
              cards={insightCards}
              distribution={data.distribution}
              loadingCardKeys={[
                ...(adminLoading ? ["priority_events"] : []),
                ...(gradingLoading ? ["grading_progress"] : []),
              ]}
              distributionLoading={adminLoading}
              gradingDetails={preparationData.grading}
            />
            <section className={styles.eventLogPanel} aria-label="事件紀錄">
              <PriorityEventsInsightCard
                card={priorityEventsCard}
                loading={adminLoading}
              />
              <ContestLogsScreen embedded />
            </section>
          </div>
        }
      />
      {selectedUserId ? (
        <div className={styles.participantDrawerLayer}>
          <button
            type="button"
            className={styles.participantDrawerBackdrop}
            aria-label="關閉學生詳細資訊背景"
            onClick={() => setSelectedUserId(null)}
          />
          <aside
            className={styles.participantDrawer}
            role="dialog"
            aria-modal="true"
            aria-label="學生詳細資訊"
          >
            <div className={styles.participantDrawerToolbar}>
              <h3>學生詳細資訊</h3>
              <Button
                kind="ghost"
                hasIconOnly
                renderIcon={Close}
                iconDescription="關閉學生詳細資訊"
                onClick={() => setSelectedUserId(null)}
              />
            </div>
            <div className={styles.participantDrawerBody}>
              <ParticipantDashboardPane
                contestId={contestId}
                dashboard={liveParticipantDashboard}
                loading={participantDashboard.loading}
                error={participantDashboard.error}
                activeDetail={activeParticipantDetail}
                overviewContent={participantOverviewContent}
                onDetailChange={setActiveParticipantDetail}
                onDownloadReport={() => void handleDownloadParticipantReport()}
                onEditStatus={openParticipantsPanel}
                onUnlock={openParticipantsPanel}
                onReopenExam={openParticipantsPanel}
                onOpenGrading={() => onOpenPanel("grading")}
                onRefreshEvents={participantDashboard.refresh}
              />
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
