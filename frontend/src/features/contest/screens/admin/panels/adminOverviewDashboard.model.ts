import type {
  ContestDetail,
  ContestOverviewMetrics,
  ContestParticipant,
  ExamEvent,
} from "@/core/entities/contest.entity";
import { getEventPriority } from "@/features/contest/constants/eventTaxonomy";
import type { GlobalStats } from "@/features/contest/screens/settings/grading/gradingTypes";
import {
  calculateContestTimeProgressAt,
  formatDuration,
} from "@/features/contest/components/admin/overviewMetrics.utils";

export type OverviewKpiKey =
  | "online"
  | "started"
  | "submitted"
  | "locked"
  | "attention";
export type AttentionKind =
  | "locked"
  | "violation"
  | "offline"
  | "not_started"
  | "needs_review";

export interface OverviewKpiItem {
  key: OverviewKpiKey;
  label: string;
  value: string;
  tone: "neutral" | "warning" | "danger";
}

export interface TeacherAttentionRow {
  id: string;
  userId: string;
  studentName: string;
  kind: AttentionKind;
  statusLabel: string;
  eventLabel: string;
  timeLabel: string;
  panelTarget: "participants" | "logs" | "proctoring";
}

export interface DistributionItem {
  key: "in_progress" | "not_started" | "submitted" | "locked" | "offline";
  label: string;
  value: number;
  percent: number;
}

export interface ExamStatusSummary {
  timeWindowLabel: string;
  remainingLabel: string;
  timeProgressPercent: number;
  resultsLabel: string;
  gradingLabel: string;
  workItemLabel: string;
  workItemCount: number;
}

export interface RecentExamEventItem {
  id: string;
  label: string;
  studentName: string;
  timeLabel: string;
  tone: "neutral" | "warning" | "danger";
}

export interface NextActionItem {
  key: "attention" | "grading" | "results";
  title: string;
  description: string;
  panelTarget: "participants" | "grading" | "logs";
  disabled?: boolean;
}

export type DashboardTone = "neutral" | "warning" | "danger";

export interface DashboardTimelineSummary {
  phaseLabel: string;
  primaryTimeLabel: string;
  timeWindowLabel: string;
  startDateTimeLabel: string;
  endDateTimeLabel: string;
  progressPercent: number;
}

export interface DashboardRailItem {
  key: string;
  label: string;
  value: string;
  tone: DashboardTone;
}

export interface DashboardChartSeries {
  key: string;
  label: string;
  values: Array<{
    label: string;
    value: number;
  }>;
}

export interface DashboardInsightCard {
  key: "grading_progress" | "exam_progress" | "priority_events";
  title: string;
  value: string;
  kind: "progress" | "line";
  progressPercent?: number;
  series?: DashboardChartSeries[];
}

export interface AdminOverviewDashboardData {
  kpis: OverviewKpiItem[];
  timeline: DashboardTimelineSummary;
  railItems: DashboardRailItem[];
  insightCards: DashboardInsightCard[];
  attentionRows: TeacherAttentionRow[];
  distribution: DistributionItem[];
  examStatus: ExamStatusSummary;
  recentEvents: RecentExamEventItem[];
  nextActions: NextActionItem[];
}

export type PreparationSummaryKey =
  | "status"
  | "schedule"
  | "work_items"
  | "participants"
  | "grading"
  | "results";

export type PreparationReadinessState = "done" | "warning" | "missing";

export interface PreparationSummaryItem {
  key: PreparationSummaryKey;
  label: string;
  value: string;
  description: string;
  tone: "neutral" | "warning" | "danger";
}

export interface PreparationChecklistItem {
  key:
    | "publish"
    | "work_items"
    | "schedule"
    | "participants"
    | "rules"
    | "anti_cheat";
  label: string;
  status: PreparationReadinessState;
  statusLabel: string;
  description: string;
}

export interface PreparationGradingSummary {
  totalAnswers: number;
  gradedAnswers: number;
  ungradedAnswers: number;
  progressPercent: number;
  progressLabel: string;
  resultsLabel: string;
  resultsTone: "neutral" | "warning" | "danger";
}

export interface AdminPreparationDashboardData {
  timeline: DashboardTimelineSummary;
  railItems: DashboardRailItem[];
  insightCards: DashboardInsightCard[];
  summaryItems: PreparationSummaryItem[];
  checklistItems: PreparationChecklistItem[];
  grading: PreparationGradingSummary;
}

const studentParticipants = (participants: ContestParticipant[]) =>
  participants.filter(
    (participant) =>
      !participant.accountRole || participant.accountRole === "student",
  );

const getProfileDisplayName = (participant: ContestParticipant) =>
  participant.displayName ||
  participant.username ||
  participant.userId;

const DISPLAY_TIME_ZONE = "Asia/Taipei";

const TIME_FORMATTER = new Intl.DateTimeFormat("zh-Hant-TW", {
  timeZone: DISPLAY_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("zh-Hant-TW", {
  timeZone: DISPLAY_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const partsToMap = (parts: Intl.DateTimeFormatPart[]) => {
  const map: Record<string, string> = {};
  for (const part of parts) map[part.type] = part.value;
  return map;
};

const formatTime = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const parts = partsToMap(TIME_FORMATTER.formatToParts(date));
  return `${parts.hour ?? "00"}:${parts.minute ?? "00"}`;
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const parts = partsToMap(DATE_TIME_FORMATTER.formatToParts(date));
  return `${parts.year ?? "0000"}/${parts.month ?? "00"}/${parts.day ?? "00"} ${parts.hour ?? "00"}:${parts.minute ?? "00"}`;
};

const formatDateKey = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = partsToMap(DATE_TIME_FORMATTER.formatToParts(date));
  return `${parts.year ?? "0000"}-${parts.month ?? "00"}-${parts.day ?? "00"}`;
};

const formatScheduleDateTime = (
  value: string | null | undefined,
  includeDate: boolean,
) => {
  if (!includeDate) return formatTime(value);
  const dateTime = formatDateTime(value);
  return dateTime === "-" ? dateTime : dateTime.replace(" ", "\n");
};

const formatWindow = (contest: ContestDetail) => {
  const start = formatTime(contest.startTime);
  const end = formatTime(contest.endTime);
  if (start === "-" || end === "-") return "未設定";
  return `${start}-${end}`;
};

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

const buildTimelineSummary = ({
  contest,
  now,
  progressPercent,
}: {
  contest: ContestDetail;
  now: Date;
  progressPercent?: number;
}): DashboardTimelineSummary => {
  const start = Date.parse(contest.startTime);
  const end = Date.parse(contest.endTime);
  const nowMs = now.getTime();
  const timeWindowLabel = formatWindow(contest);
  const startDateKey = formatDateKey(contest.startTime);
  const endDateKey = formatDateKey(contest.endTime);
  const isCrossDay = Boolean(
    startDateKey && endDateKey && startDateKey !== endDateKey,
  );
  const startDateTimeLabel = formatScheduleDateTime(contest.startTime, isCrossDay);
  const endDateTimeLabel = formatScheduleDateTime(contest.endTime, isCrossDay);

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return {
      phaseLabel: "時間未設定",
      primaryTimeLabel: "未設定",
      timeWindowLabel,
      startDateTimeLabel,
      endDateTimeLabel,
      progressPercent: 0,
    };
  }

  if (nowMs < start) {
    return {
      phaseLabel: "尚未開始",
      primaryTimeLabel: `距離開始 ${formatDuration((start - nowMs) / 1000)}`,
      timeWindowLabel,
      startDateTimeLabel,
      endDateTimeLabel,
      progressPercent: 0,
    };
  }

  if (nowMs >= end) {
    return {
      phaseLabel: "已結束",
      primaryTimeLabel: "考試已結束",
      timeWindowLabel,
      startDateTimeLabel,
      endDateTimeLabel,
      progressPercent: 100,
    };
  }

  const resolvedProgress =
    progressPercent ?? ((nowMs - start) / Math.max(1, end - start)) * 100;
  return {
    phaseLabel: "進行中",
    primaryTimeLabel: `剩餘 ${formatDuration((end - nowMs) / 1000)}`,
    timeWindowLabel,
    startDateTimeLabel,
    endDateTimeLabel,
    progressPercent: clampPercent(resolvedProgress),
  };
};

const isValidSchedule = (contest: ContestDetail) => {
  const start = Date.parse(contest.startTime);
  const end = Date.parse(contest.endTime);
  return Number.isFinite(start) && Number.isFinite(end) && end > start;
};

const getWorkItemCount = (contest: ContestDetail) =>
  contest.contestType === "paper_exam"
    ? contest.examQuestionsCount
    : contest.problems.length;

const percentage = (value: number, total: number) =>
  total <= 0 ? 0 : Math.round((value / total) * 100);

const buildProgressSeries = (percent: number): DashboardChartSeries[] => [
  {
    key: "progress",
    label: "進度",
    values: [
      { label: "開始", value: 0 },
      { label: "目前", value: clampPercent(percent) },
    ],
  },
];

const latestEventByUser = (events: ExamEvent[]) => {
  const map = new Map<string, ExamEvent>();
  for (const event of events) {
    const current = map.get(event.userId);
    const nextTs = Date.parse(event.timestamp);
    const currentTs = current
      ? Date.parse(current.timestamp)
      : Number.NEGATIVE_INFINITY;
    if (!current || nextTs > currentTs) {
      map.set(event.userId, event);
    }
  }
  return map;
};

export const getTeacherAttentionRows = ({
  participants,
  examEvents,
  limit = 5,
}: {
  participants: ContestParticipant[];
  examEvents: ExamEvent[];
  limit?: number;
}): TeacherAttentionRow[] => {
  const latest = latestEventByUser(
    examEvents.filter((event) => event.eventType !== "heartbeat"),
  );
  const rows: TeacherAttentionRow[] = [];

  for (const participant of studentParticipants(participants)) {
    const latestEvent = latest.get(participant.userId);
    const participantTimestamps = participant as ContestParticipant & {
      lockedAt?: string | null;
    };
    const common = {
      id: participant.userId,
      userId: participant.userId,
      studentName: getProfileDisplayName(participant),
      timeLabel: formatTime(
        latestEvent?.timestamp ||
          participantTimestamps.lockedAt ||
          participant.lastHeartbeatAt,
      ),
    };

    if (participant.examStatus === "locked") {
      rows.push({
        ...common,
        kind: "locked",
        statusLabel: "鎖定",
        eventLabel: participant.lockReason || "考試已鎖定",
        panelTarget: "participants",
      });
      continue;
    }

    if ((participant.violationCount ?? 0) > 0) {
      rows.push({
        ...common,
        kind: "violation",
        statusLabel: "違規",
        eventLabel: latestEvent
          ? latestEvent.eventType
          : `${participant.violationCount} 次違規`,
        panelTarget: "logs",
      });
      continue;
    }

    if (participant.connectionStatus === "offline") {
      rows.push({
        ...common,
        kind: "offline",
        statusLabel: "離線",
        eventLabel: "連線中斷",
        panelTarget: "participants",
      });
      continue;
    }

    if (participant.examStatus === "not_started") {
      rows.push({
        ...common,
        kind: "not_started",
        statusLabel: "未開始",
        eventLabel: "尚未進入考試",
        panelTarget: "participants",
      });
    }
  }

  const order: Record<AttentionKind, number> = {
    locked: 0,
    violation: 1,
    offline: 2,
    not_started: 3,
    needs_review: 4,
  };
  return rows.sort((a, b) => order[a.kind] - order[b.kind]).slice(0, limit);
};

const buildDistribution = (
  participants: ContestParticipant[],
): DistributionItem[] => {
  const students = studentParticipants(participants);
  const total = students.length;
  const count = (predicate: (participant: ContestParticipant) => boolean) =>
    students.filter(predicate).length;

  const items = [
    {
      key: "in_progress" as const,
      label: "作答中",
      value: count((p) => p.examStatus === "in_progress"),
    },
    {
      key: "not_started" as const,
      label: "未開始",
      value: count((p) => p.examStatus === "not_started"),
    },
    {
      key: "submitted" as const,
      label: "已交卷",
      value: count((p) => p.examStatus === "submitted"),
    },
    {
      key: "locked" as const,
      label: "鎖定",
      value: count(
        (p) => p.examStatus === "locked" || p.examStatus === "paused",
      ),
    },
    {
      key: "offline" as const,
      label: "離線",
      value: count((p) => p.connectionStatus === "offline"),
    },
  ];

  return items.map((item) => ({
    ...item,
    percent: percentage(item.value, total),
  }));
};

const buildRecentEvents = (examEvents: ExamEvent[]): RecentExamEventItem[] =>
  examEvents
    .filter((event) => event.eventType !== "heartbeat")
    .slice(0, 4)
    .map((event) => {
      const priority = getEventPriority(event.eventType);
      return {
        id: event.id,
        label: event.eventType,
        studentName: event.userName || "-",
        timeLabel: formatTime(event.timestamp),
        tone:
          priority === 0 ? "danger" : priority === 1 ? "warning" : "neutral",
      };
    });

const buildPriorityEventSeries = (
  examEvents: ExamEvent[],
): DashboardChartSeries[] => {
  const priorityEvents = examEvents
    .filter((event) => {
      const priority = getEventPriority(event.eventType);
      return priority >= 0 && priority <= 2;
    })
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const bucketLabels = Array.from(
    new Set(priorityEvents.map((event) => formatTime(event.timestamp))),
  ).slice(-8);

  const safeLabels = bucketLabels.length > 0 ? bucketLabels : ["目前"];
  const countFor = (priority: number, label: string) =>
    priorityEvents.filter(
      (event) =>
        getEventPriority(event.eventType) === priority &&
        formatTime(event.timestamp) === label,
    ).length;

  return [
    {
      key: "p0",
      label: "P0",
      values: safeLabels.map((label) => ({
        label,
        value: countFor(0, label),
      })),
    },
    {
      key: "p1",
      label: "P1",
      values: safeLabels.map((label) => ({
        label,
        value: countFor(1, label),
      })),
    },
    {
      key: "p2",
      label: "P2",
      values: safeLabels.map((label) => ({
        label,
        value: countFor(2, label),
      })),
    },
  ];
};

const buildInsightCards = ({
  gradingPercent,
  gradingLabel,
  examProgressPercent,
  examEvents,
}: {
  gradingPercent: number;
  gradingLabel: string;
  examProgressPercent: number;
  examEvents: ExamEvent[];
}): DashboardInsightCard[] => {
  const priorityTotal = examEvents.filter((event) => {
    const priority = getEventPriority(event.eventType);
    return priority >= 0 && priority <= 2;
  }).length;

  return [
    {
      key: "grading_progress",
      title: "批改進度",
      value: gradingLabel,
      kind: "progress",
      progressPercent: gradingPercent,
      series: buildProgressSeries(gradingPercent),
    },
    {
      key: "exam_progress",
      title: "考試進度",
      value: `${Math.round(clampPercent(examProgressPercent))}%`,
      kind: "progress",
      progressPercent: examProgressPercent,
      series: buildProgressSeries(examProgressPercent),
    },
    {
      key: "priority_events",
      title: "違規事件",
      value: String(priorityTotal),
      kind: "line",
      series: buildPriorityEventSeries(examEvents),
    },
  ];
};

export const buildAdminOverviewDashboard = ({
  contest,
  participants,
  examEvents,
  overviewMetrics,
  gradingStats,
  now = new Date(),
}: {
  contest: ContestDetail;
  participants: ContestParticipant[];
  examEvents: ExamEvent[];
  overviewMetrics: ContestOverviewMetrics | null;
  gradingStats?: GlobalStats;
  now?: Date;
}): AdminOverviewDashboardData => {
  const students = studentParticipants(participants);
  const total = Math.max(students.length, contest.participantCount || 0);
  const started = students.filter((p) => p.examStatus !== "not_started").length;
  const submitted = students.filter((p) => p.examStatus === "submitted").length;
  const locked = students.filter(
    (p) => p.examStatus === "locked" || p.examStatus === "paused",
  ).length;
  const inProgress = students.filter(
    (p) => p.examStatus === "in_progress",
  ).length;
  const notStarted = students.filter(
    (p) => p.examStatus === "not_started",
  ).length;
  const offline = students.filter(
    (p) => p.connectionStatus === "offline",
  ).length;
  const attentionRows = getTeacherAttentionRows({
    participants,
    examEvents,
    limit: 5,
  });
  const liveTimeProgress =
    overviewMetrics?.timeProgress ||
    calculateContestTimeProgressAt(contest, now.getTime());
  const gradedAnswers = gradingStats?.gradedAnswers ?? 0;
  const totalAnswers = gradingStats?.totalAnswers ?? 0;
  const gradingPercent =
    totalAnswers > 0 ? Math.round((gradedAnswers / totalAnswers) * 100) : 0;
  const gradingLabel = totalAnswers > 0 ? `${gradingPercent}%` : "尚無批改資料";
  const workItemCount = getWorkItemCount(contest);

  return {
    kpis: [
      {
        key: "online",
        label: "在線考生",
        value: `${overviewMetrics?.onlineNow ?? 0} / ${total}`,
        tone: "neutral",
      },
      {
        key: "started",
        label: "已開始",
        value: String(started),
        tone: "neutral",
      },
      {
        key: "submitted",
        label: "已交卷",
        value: String(submitted),
        tone: "neutral",
      },
      {
        key: "locked",
        label: "鎖定",
        value: String(locked),
        tone: locked > 0 ? "danger" : "neutral",
      },
      {
        key: "attention",
        label: "待處理事件",
        value: String(attentionRows.length),
        tone: attentionRows.length > 0 ? "warning" : "neutral",
      },
    ],
    timeline: buildTimelineSummary({
      contest,
      now,
      progressPercent: liveTimeProgress.progressPercent,
    }),
    railItems: [
      {
        key: "online",
        label: "在線",
        value: `${overviewMetrics?.onlineNow ?? 0} / ${total}`,
        tone: "neutral",
      },
      {
        key: "in_progress",
        label: "作答中",
        value: String(inProgress),
        tone: "neutral",
      },
      {
        key: "not_started",
        label: "未開始",
        value: String(notStarted),
        tone: notStarted > 0 ? "warning" : "neutral",
      },
      {
        key: "submitted",
        label: "已交卷",
        value: String(submitted),
        tone: "neutral",
      },
      {
        key: "locked_offline",
        label: "鎖定 / 離線",
        value: `${locked} / ${offline}`,
        tone: locked > 0 || offline > 0 ? "danger" : "neutral",
      },
    ],
    insightCards: buildInsightCards({
      gradingPercent,
      gradingLabel,
      examProgressPercent: liveTimeProgress.progressPercent,
      examEvents,
    }),
    attentionRows,
    distribution: buildDistribution(participants),
    examStatus: {
      timeWindowLabel: formatWindow(contest),
      remainingLabel: liveTimeProgress.isEnded
        ? "已結束"
        : formatDuration(liveTimeProgress.remainingSeconds),
      timeProgressPercent: liveTimeProgress.progressPercent,
      resultsLabel: contest.resultsPublished ? "已發布" : "未發布",
      gradingLabel,
      workItemLabel:
        contest.contestType === "paper_exam" ? "考卷題目" : "程式題目",
      workItemCount,
    },
    recentEvents: buildRecentEvents(examEvents),
    nextActions: [
      {
        key: "attention",
        title: "處理異常",
        description:
          attentionRows.length > 0
            ? `${attentionRows.length} 位考生需要確認`
            : "目前沒有待處理異常",
        panelTarget: "participants",
        disabled: attentionRows.length === 0,
      },
      {
        key: "grading",
        title: "前往批改",
        description:
          totalAnswers > 0 ? `已批改 ${gradingPercent}%` : "考後可開始批改",
        panelTarget: "grading",
      },
      {
        key: "results",
        title: "發布成績",
        description: contest.resultsPublished ? "成績已發布" : "確認批改後發布",
        panelTarget: "grading",
        disabled: contest.resultsPublished,
      },
    ],
  };
};

const contestStatusLabel = (status: ContestDetail["status"]) => {
  if (status === "draft") return "草稿";
  if (status === "archived") return "已封存";
  return "已發布";
};

const readinessLabel = (status: PreparationReadinessState) => {
  if (status === "done") return "完成";
  if (status === "missing") return "缺少";
  return "待確認";
};

export const buildAdminPreparationDashboard = ({
  contest,
  participants,
  gradingStats,
  now = new Date(),
}: {
  contest: ContestDetail;
  participants: ContestParticipant[];
  gradingStats?: GlobalStats;
  now?: Date;
}): AdminPreparationDashboardData => {
  const students = studentParticipants(participants);
  const participantTotal = Math.max(
    students.length,
    contest.participantCount || 0,
  );
  const workItemCount = getWorkItemCount(contest);
  const scheduleReady = isValidSchedule(contest);
  const hasRules = Boolean(contest.rules?.trim());
  const totalAnswers = gradingStats?.totalAnswers ?? 0;
  const gradedAnswers = gradingStats?.gradedAnswers ?? 0;
  const ungradedAnswers =
    gradingStats?.ungradedAnswers ?? Math.max(totalAnswers - gradedAnswers, 0);
  const gradingPercent = percentage(gradedAnswers, totalAnswers);
  const gradingLabel = totalAnswers > 0 ? `${gradingPercent}%` : "尚無資料";
  const workItemLabel =
    contest.contestType === "paper_exam" ? "考卷題目" : "程式題目";
  const publishState: PreparationReadinessState =
    contest.status === "published" ? "done" : "warning";

  const checklistItems: PreparationChecklistItem[] = [
    {
      key: "publish",
      label: "競賽發布",
      status: publishState,
      statusLabel: readinessLabel(publishState),
      description:
        contest.status === "published"
          ? "參賽者可依權限進入競賽"
          : `目前狀態：${contestStatusLabel(contest.status)}`,
    },
    {
      key: "work_items",
      label: workItemLabel,
      status: workItemCount > 0 ? "done" : "missing",
      statusLabel: readinessLabel(workItemCount > 0 ? "done" : "missing"),
      description:
        workItemCount > 0
          ? `已設定 ${workItemCount} 題`
          : "尚未建立可作答的題目",
    },
    {
      key: "schedule",
      label: "考試時段",
      status: scheduleReady ? "done" : "missing",
      statusLabel: readinessLabel(scheduleReady ? "done" : "missing"),
      description: scheduleReady
        ? formatWindow(contest)
        : "開始與結束時間未完整設定",
    },
    {
      key: "participants",
      label: "參賽者名單",
      status: participantTotal > 0 ? "done" : "warning",
      statusLabel: readinessLabel(participantTotal > 0 ? "done" : "warning"),
      description:
        participantTotal > 0
          ? `${participantTotal} 位參賽者`
          : "尚未看到參賽者資料",
    },
    {
      key: "rules",
      label: "作答規則",
      status: hasRules ? "done" : "warning",
      statusLabel: readinessLabel(hasRules ? "done" : "warning"),
      description: hasRules ? "已填寫規則說明" : "可補上考試規則與注意事項",
    },
    {
      key: "anti_cheat",
      label: "防作弊設定",
      status: contest.cheatDetectionEnabled ? "done" : "warning",
      statusLabel: readinessLabel(
        contest.cheatDetectionEnabled ? "done" : "warning",
      ),
      description: contest.cheatDetectionEnabled
        ? "防作弊監控已啟用"
        : "可依考試需求啟用",
    },
  ];

  return {
    timeline: buildTimelineSummary({
      contest,
      now,
    }),
    railItems: [
      {
        key: "status",
        label: "競賽狀態",
        value: contestStatusLabel(contest.status),
        tone: contest.status === "published" ? "neutral" : "warning",
      },
      {
        key: "work_items",
        label: workItemLabel,
        value: String(workItemCount),
        tone: workItemCount > 0 ? "neutral" : "danger",
      },
      {
        key: "participants",
        label: "參賽者",
        value: String(participantTotal),
        tone: participantTotal > 0 ? "neutral" : "warning",
      },
      {
        key: "anti_cheat",
        label: "防作弊",
        value: contest.cheatDetectionEnabled ? "已啟用" : "未啟用",
        tone: contest.cheatDetectionEnabled ? "neutral" : "warning",
      },
      {
        key: "results",
        label: "成績",
        value: contest.resultsPublished ? "已發布" : "未發布",
        tone: contest.resultsPublished ? "neutral" : "warning",
      },
    ],
    insightCards: buildInsightCards({
      gradingPercent,
      gradingLabel,
      examProgressPercent: buildTimelineSummary({ contest, now })
        .progressPercent,
      examEvents: [],
    }),
    summaryItems: [
      {
        key: "status",
        label: "競賽狀態",
        value: contestStatusLabel(contest.status),
        description:
          contest.status === "published" ? "已開放給參賽者" : "尚未正式開放",
        tone: contest.status === "published" ? "neutral" : "warning",
      },
      {
        key: "schedule",
        label: "考試時段",
        value: formatWindow(contest),
        description: scheduleReady ? "時間設定完整" : "需要補齊時間",
        tone: scheduleReady ? "neutral" : "danger",
      },
      {
        key: "work_items",
        label: workItemLabel,
        value: String(workItemCount),
        description: workItemCount > 0 ? "內容已建立" : "尚未建立內容",
        tone: workItemCount > 0 ? "neutral" : "danger",
      },
      {
        key: "participants",
        label: "參賽者",
        value: String(participantTotal),
        description: participantTotal > 0 ? "名單可供管理" : "尚無參賽者資料",
        tone: participantTotal > 0 ? "neutral" : "warning",
      },
      {
        key: "grading",
        label: "批改進度",
        value: gradingLabel,
        description:
          totalAnswers > 0
            ? `${gradedAnswers} / ${totalAnswers} 份`
            : "考後才會產生批改資料",
        tone: ungradedAnswers > 0 ? "warning" : "neutral",
      },
      {
        key: "results",
        label: "成績",
        value: contest.resultsPublished ? "已發布" : "未發布",
        description: contest.resultsPublished
          ? "參賽者可查看"
          : "確認批改後發布",
        tone: contest.resultsPublished ? "neutral" : "warning",
      },
    ],
    checklistItems,
    grading: {
      totalAnswers,
      gradedAnswers,
      ungradedAnswers,
      progressPercent: gradingPercent,
      progressLabel:
        totalAnswers > 0
          ? `${gradedAnswers} / ${totalAnswers}`
          : "尚無作答資料",
      resultsLabel: contest.resultsPublished ? "已發布" : "未發布",
      resultsTone: contest.resultsPublished ? "neutral" : "warning",
    },
  };
};
