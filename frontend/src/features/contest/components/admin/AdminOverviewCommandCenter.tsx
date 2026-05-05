import {
  Button,
  OverflowMenu,
  OverflowMenuItem,
  Search,
  SelectableTag,
  SkeletonText,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
} from "@carbon/react";
import {
  CheckmarkFilled,
  CircleDash,
  Close,
  Filter,
  InProgress,
  Locked,
  PauseFilled,
  Time,
  WarningFilled,
} from "@carbon/icons-react";
import {
  cloneElement,
  isValidElement,
  useMemo,
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
  type ElementType,
  type ReactElement,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslation } from "react-i18next";
import type {
  ContestParticipant,
  ExamStatusType,
  ParticipantDashboardDetail,
} from "@/core/entities/contest.entity";
import AdminInsightRail, {
  PriorityEventsInsightCard,
  type InsightCardAction,
} from "@/features/contest/components/admin/AdminInsightRail";
import AdminSegmentedDashboard from "@/features/contest/components/admin/AdminSegmentedDashboard";
import ParticipantDashboardPane from "@/features/contest/components/participants/ParticipantDashboardPane";
import ParticipantOperationsPane from "@/features/contest/components/participants/ParticipantOperationsPane";
import ParticipantStatusEditModal from "@/features/contest/components/participants/ParticipantStatusEditModal";
import {
  EXAM_STATUS_LABELS,
  getExamStatusLabel,
} from "@/features/contest/constants/examLabels";
import { useContest, useContestAdmin } from "@/features/contest/contexts";
import { CountdownProgress } from "@/features/contest/components/CountdownProgress";
import type { AdminPanelId } from "@/features/contest/modules/types";
import useParticipantDashboard from "@/features/contest/screens/settings/participants/useParticipantDashboard";
import ContestLogsScreen from "@/features/contest/screens/settings/ContestLogsScreen";
import type {
  AdminOverviewDashboardData,
} from "@/features/contest/screens/admin/panels/adminOverviewDashboard.model";
import {
  downloadParticipantReport,
  removeParticipant,
  reopenExam,
  unlockParticipant,
  updateParticipant,
} from "@/infrastructure/api/repositories";
import { useToast } from "@/shared/contexts/ToastContext";
import { ConfirmModal, useConfirmModal } from "@/shared/ui/modal";
import {
  BlockHeader,
  DashboardBlock,
  DashboardContainer,
  MetricBlock,
} from "@/shared/components/dashboard";
import styles from "./AdminOverviewCommandCenter.module.scss";

interface AdminOverviewCommandCenterProps {
  header?: ReactNode;
  data: AdminOverviewDashboardData;
  adminLoading?: boolean;
  gradingLoading?: boolean;
  contestId?: string;
  antiCheatEnabled?: boolean;
  classroomBound?: boolean;
  contestInProgress?: boolean;
  onOpenPanel: (panel: AdminPanelId) => void;
  participants: ContestParticipant[];
  primary: ReactNode;
  questionStatsGallery?: ReactNode;
  resultOverview?: ReactNode;
  gradingAction?: InsightCardAction;
}

const isStudentParticipant = (participant: ContestParticipant) =>
  !participant.accountRole || participant.accountRole === "student";

const getProfileDisplayName = (participant: ContestParticipant) =>
  participant.displayName ||
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

const DATE_TIME_LABEL_REGEX = /^(\d{4}\/\d{2}\/\d{2})\s+(\d{2}:\d{2})$/;

const normalizeScheduleLabels = (
  startLabel: string,
  endLabel: string,
): { start: string; end: string } => {
  const startMatch = startLabel.match(DATE_TIME_LABEL_REGEX);
  const endMatch = endLabel.match(DATE_TIME_LABEL_REGEX);
  if (!startMatch || !endMatch) {
    return { start: startLabel, end: endLabel };
  }

  const [, startDate, startTime] = startMatch;
  const [, endDate, endTime] = endMatch;
  if (startDate === endDate) {
    return { start: startTime, end: endTime };
  }

  return {
    start: `${startDate}\n${startTime}`,
    end: `${endDate}\n${endTime}`,
  };
};

type ParticipantStatusFilter =
  | "all"
  | "needs_attention"
  | NonNullable<ContestParticipant["examStatus"]>;

type FilterOption<TId extends string = string> = {
  id: TId;
  label: string;
};

const PARTICIPANT_STATUS_FILTERS: FilterOption<ParticipantStatusFilter>[] = [
  { id: "all", label: "全部狀態" },
  { id: "needs_attention", label: "需要處理" },
  { id: "in_progress", label: "作答中" },
  { id: "submitted", label: "已交卷" },
  { id: "not_started", label: "未開始" },
  { id: "locked", label: "鎖定" },
  { id: "paused", label: "暫停" },
];

const QUESTION_KIND_FILTERS: FilterOption[] = [
  { id: "all", label: "全部題型" },
  { id: "single_choice", label: "單選題" },
  { id: "multiple_choice", label: "多選題" },
  { id: "true_false", label: "是非題" },
  { id: "short_answer", label: "簡答題" },
  { id: "essay", label: "申論題" },
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
  header,
  data,
  adminLoading = false,
  gradingLoading = false,
  contestId,
  antiCheatEnabled = false,
  classroomBound = false,
  contestInProgress = false,
  onOpenPanel,
  participants,
  primary,
  questionStatsGallery,
  resultOverview,
  gradingAction,
}: AdminOverviewCommandCenterProps) {
  const { t } = useTranslation("contest");
  const { showToast } = useToast();
  const { confirm, modalProps: confirmModalProps } = useConfirmModal();
  const { contest } = useContest();
  const { refreshAllAdminData, refreshParticipants, examEventsLoading } =
    useContestAdmin();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [participantMetric, setParticipantMetric] =
    useState<ParticipantMetricKey>("score");
  const [participantSearch, setParticipantSearch] = useState("");
  const [participantStatusFilter, setParticipantStatusFilter] =
    useState<ParticipantStatusFilter>("all");
  const [activePanelTab, setActivePanelTab] = useState(0);
  const [questionStatsSearch, setQuestionStatsSearch] = useState("");
  const [questionStatsKindFilter, setQuestionStatsKindFilter] =
    useState<string>("all");
  const [activeParticipantDetail, setActiveParticipantDetail] =
    useState<ParticipantDashboardDetail>("overview");
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingParticipant, setEditingParticipant] =
    useState<ContestParticipant | null>(null);
  const [editExamStatus, setEditExamStatus] =
    useState<ExamStatusType>("not_started");
  const [editLockReason, setEditLockReason] = useState("");
  const [savingStatus, setSavingStatus] = useState(false);
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

  useEffect(() => {
    if (!contestId || !contestInProgress) return;
    // Background poll: only while the contest is actually running. Stays at a
    // light 30s cadence and skips when the tab is hidden; refreshParticipants
    // is dedupe'd inside the context so identical payloads won't trigger
    // re-renders.
    let inFlight = false;
    const tick = async () => {
      if (document.visibilityState !== "visible" || inFlight) return;
      inFlight = true;
      try {
        await refreshParticipants();
      } finally {
        inFlight = false;
      }
    };
    const intervalId = window.setInterval(() => {
      void tick();
    }, 30000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [contestId, contestInProgress, refreshParticipants]);

  const refreshAfterAction = useCallback(async () => {
    await Promise.all([refreshAllAdminData(), participantDashboard.refresh()]);
  }, [refreshAllAdminData, participantDashboard]);

  const handleDownloadParticipantReport = useCallback(async () => {
    if (!contestId || !selectedUserId) return;
    try {
      await downloadParticipantReport(contestId, selectedUserId);
      showToast({
        kind: "success",
        title: t("common.success", "成功"),
        subtitle: t("participants.reportDownloaded", "報告已下載"),
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t("participants.downloadFailed", "下載報告失敗");
      showToast({
        kind: "error",
        title: t("common.error", "錯誤"),
        subtitle: message,
      });
    }
  }, [contestId, selectedUserId, showToast, t]);

  const openEditModal = useCallback(() => {
    if (!participantDashboard.data) return;
    setEditingParticipant(participantDashboard.data.participant);
    setEditExamStatus(
      participantDashboard.data.participant.examStatus || "not_started",
    );
    setEditLockReason(participantDashboard.data.participant.lockReason || "");
    setEditModalOpen(true);
  }, [participantDashboard.data]);

  const handleUpdateParticipant = useCallback(async () => {
    if (!contestId || !editingParticipant) return;
    setSavingStatus(true);
    try {
      await updateParticipant(contestId, Number(editingParticipant.userId), {
        exam_status: editExamStatus,
        lock_reason: editExamStatus === "locked" ? editLockReason : "",
      });
      setEditModalOpen(false);
      await refreshAfterAction();
      showToast({
        kind: "success",
        title: t("common.success", "成功"),
        subtitle: t("participants.statusUpdated", "參賽者狀態已更新"),
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t("participants.updateFailed", "更新失敗");
      showToast({
        kind: "error",
        title: t("common.error", "錯誤"),
        subtitle: message,
      });
    } finally {
      setSavingStatus(false);
    }
  }, [
    contestId,
    editingParticipant,
    editExamStatus,
    editLockReason,
    refreshAfterAction,
    showToast,
    t,
  ]);

  const handleUnlock = useCallback(async () => {
    if (!contestId || !selectedUserId) return;
    const confirmed = await confirm({
      title: t("participants.confirmUnlock", "確定要解除此學生的鎖定嗎？"),
      confirmLabel: t("participants.unlock", "解除"),
      cancelLabel: t("button.cancel", "取消"),
      danger: true,
    });
    if (!confirmed) return;
    try {
      await unlockParticipant(contestId, Number(selectedUserId));
      await refreshAfterAction();
      showToast({
        kind: "success",
        title: t("common.success", "成功"),
        subtitle: t("participants.unlocked", "已解除鎖定"),
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t("participants.unlockFailed", "解除鎖定失敗");
      showToast({
        kind: "error",
        title: t("common.error", "錯誤"),
        subtitle: message,
      });
    }
  }, [confirm, contestId, refreshAfterAction, selectedUserId, showToast, t]);

  const handleReopenExam = useCallback(async () => {
    if (!contestId || !selectedUserId) return;
    const confirmed = await confirm({
      title: t("participants.confirmReopen", "確定要重新開放此學生考試嗎？"),
      confirmLabel: t("participants.reopen", "重新開放"),
      cancelLabel: t("button.cancel", "取消"),
      danger: true,
    });
    if (!confirmed) return;
    try {
      await reopenExam(contestId, Number(selectedUserId));
      await refreshAfterAction();
      showToast({
        kind: "success",
        title: t("common.success", "成功"),
        subtitle: t("participants.reopened", "已重新開放考試"),
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t("participants.reopenFailed", "重新開放失敗");
      showToast({
        kind: "error",
        title: t("common.error", "錯誤"),
        subtitle: message,
      });
    }
  }, [confirm, contestId, refreshAfterAction, selectedUserId, showToast, t]);

  const handleRemoveParticipant = useCallback(async () => {
    if (!contestId || !selectedUserId || !participantDashboard.data) return;
    const confirmed = await confirm({
      title: t("participants.confirmRemove", {
        name: participantDashboard.data.participant.username,
      }),
      confirmLabel: t("participants.remove", "移除"),
      cancelLabel: t("button.cancel", "取消"),
      danger: true,
    });
    if (!confirmed) return;
    try {
      await removeParticipant(contestId, Number(selectedUserId));
      await refreshAllAdminData();
      setSelectedUserId(null);
      showToast({
        kind: "success",
        title: t("common.success", "成功"),
        subtitle: t("participants.removed", "參賽者已移除"),
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t("participants.removeFailed", "移除參賽者失敗");
      showToast({
        kind: "error",
        title: t("common.error", "錯誤"),
        subtitle: message,
      });
    }
  }, [
    confirm,
    contestId,
    participantDashboard.data,
    refreshAllAdminData,
    selectedUserId,
    showToast,
    t,
  ]);

  const studentParticipants = participants
    .filter(isStudentParticipant)
    .sort(
      (left, right) =>
        getParticipantSortScore(right) - getParticipantSortScore(left) ||
        getProfileDisplayName(left).localeCompare(
          getProfileDisplayName(right),
          "zh-TW",
        ),
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
        getProfileDisplayName(participant),
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
  const handleParticipantSearchChange = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    setParticipantSearch(event.target.value);
  };
  const isFilterActive = participantStatusFilter !== "all";
  const isQuestionStatsFilterActive = questionStatsKindFilter !== "all";
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
  const examStatusSummary = (
    <DashboardContainer
      layout="stack"
      dividers="auto"
      ariaLabel="考試狀態摘要"
    >
      <DashboardContainer layout="grid" columns={2} dividers="auto">
        <DashboardBlock>
          <MetricBlock
            label="考試人數"
            value={studentParticipants.length}
            size="lg"
          />
        </DashboardBlock>
        <DashboardBlock>
          <MetricBlock label="在線人數" value={liveStudentCount} size="lg" />
        </DashboardBlock>
      </DashboardContainer>
      <DashboardContainer
        layout="grid"
        columns={2}
        dividers="auto"
        ariaLabel="考試時間"
      >
        <DashboardBlock>
          <MetricBlock
            label="開始時間"
            value={scheduleLabels.start}
            size="lg"
          />
        </DashboardBlock>
        <DashboardBlock>
          <MetricBlock label="結束時間" value={scheduleLabels.end} size="lg" />
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
      onEditStatus={openEditModal}
      onUnlock={() => void handleUnlock()}
      onReopenExam={() => void handleReopenExam()}
      onRemoveParticipant={
        classroomBound ? undefined : () => void handleRemoveParticipant()
      }
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
                        <strong>{getProfileDisplayName(participant)}</strong>
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
      <BlockHeader title="考生列表" />
      {participantMetricTags}
      {participantContent}
    </div>
  );
  const participantTabToolbar = (
    <div
      className={`${styles.tabRowToolbar} ${
        isFilterActive ? styles.tabRowToolbarActive : ""
      }`}
    >
      <Search
        id="overview-participants-search"
        labelText="搜尋考生"
        placeholder="搜尋顯示名稱或使用者名稱..."
        value={participantSearch}
        onChange={handleParticipantSearchChange}
        onClear={() => setParticipantSearch("")}
        size="md"
        className={styles.tabRowSearch}
      />
      <OverflowMenu
        renderIcon={Filter}
        iconDescription="篩選狀態"
        size="md"
        flipped
        className={styles.tabRowFilterMenu}
        aria-label="篩選考生狀態"
      >
        {PARTICIPANT_STATUS_FILTERS.map((option) => (
          <OverflowMenuItem
            key={option.id}
            itemText={
              participantStatusFilter === option.id
                ? `✓  ${option.label}`
                : option.label
            }
            onClick={() => setParticipantStatusFilter(option.id)}
          />
        ))}
      </OverflowMenu>
    </div>
  );
  const questionStatsPanel = (
    <div className={`${styles.drilldownPanel} ${styles.drilldownPanelFlush}`}>
      {isValidElement(questionStatsGallery)
        ? cloneElement(
            questionStatsGallery as ReactElement<{
              searchQuery?: string;
              onSearchQueryChange?: (q: string) => void;
              questionKindFilter?: string;
              onQuestionKindFilterChange?: (kind: string) => void;
              showFilterToolbar?: boolean;
            }>,
            {
              searchQuery: questionStatsSearch,
              onSearchQueryChange: setQuestionStatsSearch,
              questionKindFilter: questionStatsKindFilter,
              onQuestionKindFilterChange: setQuestionStatsKindFilter,
              showFilterToolbar: false,
            },
          )
        : questionStatsGallery ?? (
        <div className={styles.emptyState}>目前沒有作答分佈資料</div>
      )}
    </div>
  );
  const questionStatsTabToolbar = (
    <div
      className={`${styles.tabRowToolbar} ${
        isQuestionStatsFilterActive ? styles.tabRowToolbarActive : ""
      }`}
    >
      <Search
        id="overview-question-stats-search"
        labelText="搜尋題目"
        placeholder="搜尋題號或題目..."
        value={questionStatsSearch}
        onChange={(event) => setQuestionStatsSearch(event.target.value)}
        onClear={() => setQuestionStatsSearch("")}
        size="md"
        className={styles.tabRowSearch}
      />
      <OverflowMenu
        renderIcon={Filter}
        iconDescription="篩選題型"
        size="md"
        flipped
        className={styles.tabRowFilterMenu}
        aria-label="篩選題型"
      >
        {QUESTION_KIND_FILTERS.map((option) => (
          <OverflowMenuItem
            key={option.id}
            itemText={
              questionStatsKindFilter === option.id
                ? `✓  ${option.label}`
                : option.label
            }
            onClick={() => setQuestionStatsKindFilter(option.id)}
          />
        ))}
      </OverflowMenu>
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
          {activePanelTab === 0 ? participantTabToolbar : questionStatsTabToolbar}
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
        header={header}
        primary={
          <div className={styles.leftOverviewColumn}>
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
            <AdminInsightRail
              cards={gradingInsightCards}
              loadingCardKeys={gradingLoading ? ["grading_progress"] : []}
              gradingAction={gradingAction}
            />
            {resultOverview}
            <AdminInsightRail
              cards={nonGradingInsightCards}
              loadingCardKeys={[
                ...(adminLoading || examEventsLoading
                  ? ["priority_events"]
                  : []),
              ]}
            />
            <section className={styles.eventLogPanel} aria-label="事件紀錄">
              <PriorityEventsInsightCard
                card={priorityEventsCard}
                loading={adminLoading || examEventsLoading}
              />
              <ContestLogsScreen embedded />
            </section>
          </DashboardContainer>
        }
      />
      <AnimatePresence>
        {selectedUserId ? (
          <motion.div
            className={styles.participantDrawerLayer}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
          >
            <motion.button
              type="button"
              className={styles.participantDrawerBackdrop}
              aria-label="關閉學生詳細資訊背景"
              onClick={() => setSelectedUserId(null)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
            />
            <motion.aside
              className={styles.participantDrawer}
              role="dialog"
              aria-modal="true"
              aria-label="學生詳細資訊"
              initial={{ x: 24, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 24, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
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
                  onEditStatus={openEditModal}
                  onUnlock={() => void handleUnlock()}
                  onReopenExam={() => void handleReopenExam()}
                  onRemoveParticipant={
                    classroomBound
                      ? undefined
                      : () => void handleRemoveParticipant()
                  }
                  onOpenGrading={() => onOpenPanel("grading")}
                  onRefreshEvents={participantDashboard.refresh}
                />
              </div>
            </motion.aside>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <ParticipantStatusEditModal
        open={editModalOpen}
        saving={savingStatus}
        participantUsername={editingParticipant?.username}
        examStatus={editExamStatus}
        lockReason={editLockReason}
        onClose={() => setEditModalOpen(false)}
        onSubmit={() => void handleUpdateParticipant()}
        onExamStatusChange={setEditExamStatus}
        onLockReasonChange={setEditLockReason}
      />
      <ConfirmModal {...confirmModalProps} />
    </>
  );
}
