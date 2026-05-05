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

export type DashboardText = (
  key: string,
  defaultValue: string,
  values?: Record<string, string | number>,
) => string;

const interpolateDashboardText = (
  defaultValue: string,
  values?: Record<string, string | number>,
) =>
  defaultValue.replace(/{{(\w+)}}/g, (_, name) =>
    String(values?.[name] ?? ""),
  );

const defaultDashboardText: DashboardText = (_key, defaultValue, values) =>
  interpolateDashboardText(defaultValue, values);

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

const formatWindow = (
  contest: ContestDetail,
  tr: DashboardText = defaultDashboardText,
) => {
  const start = formatTime(contest.startTime);
  const end = formatTime(contest.endTime);
  if (start === "-" || end === "-") {
    return tr("adminOverview.model.common.unset", "未設定");
  }
  return `${start}-${end}`;
};

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

const buildTimelineSummary = ({
  contest,
  now,
  progressPercent,
  tr = defaultDashboardText,
}: {
  contest: ContestDetail;
  now: Date;
  progressPercent?: number;
  tr?: DashboardText;
}): DashboardTimelineSummary => {
  const start = Date.parse(contest.startTime);
  const end = Date.parse(contest.endTime);
  const nowMs = now.getTime();
  const timeWindowLabel = formatWindow(contest, tr);
  const startDateKey = formatDateKey(contest.startTime);
  const endDateKey = formatDateKey(contest.endTime);
  const isCrossDay = Boolean(
    startDateKey && endDateKey && startDateKey !== endDateKey,
  );
  const startDateTimeLabel = formatScheduleDateTime(contest.startTime, isCrossDay);
  const endDateTimeLabel = formatScheduleDateTime(contest.endTime, isCrossDay);

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return {
      phaseLabel: tr("adminOverview.model.timeline.timeUnset", "時間未設定"),
      primaryTimeLabel: tr("adminOverview.model.common.unset", "未設定"),
      timeWindowLabel,
      startDateTimeLabel,
      endDateTimeLabel,
      progressPercent: 0,
    };
  }

  if (nowMs < start) {
    return {
      phaseLabel: tr("adminOverview.model.timeline.notStarted", "尚未開始"),
      primaryTimeLabel: tr(
        "adminOverview.model.timeline.startsIn",
        "距離開始 {{time}}",
        { time: formatDuration((start - nowMs) / 1000) },
      ),
      timeWindowLabel,
      startDateTimeLabel,
      endDateTimeLabel,
      progressPercent: 0,
    };
  }

  if (nowMs >= end) {
    return {
      phaseLabel: tr("adminOverview.model.timeline.ended", "已結束"),
      primaryTimeLabel: tr(
        "adminOverview.model.timeline.examEnded",
        "考試已結束",
      ),
      timeWindowLabel,
      startDateTimeLabel,
      endDateTimeLabel,
      progressPercent: 100,
    };
  }

  const resolvedProgress =
    progressPercent ?? ((nowMs - start) / Math.max(1, end - start)) * 100;
  return {
    phaseLabel: tr("adminOverview.model.timeline.running", "進行中"),
    primaryTimeLabel: tr("adminOverview.model.timeline.remaining", "剩餘 {{time}}", {
      time: formatDuration((end - nowMs) / 1000),
    }),
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

const buildProgressSeries = (
  percent: number,
  tr: DashboardText = defaultDashboardText,
): DashboardChartSeries[] => [
  {
    key: "progress",
    label: tr("adminOverview.model.progress.label", "進度"),
    values: [
      { label: tr("adminOverview.model.progress.start", "開始"), value: 0 },
      {
        label: tr("adminOverview.model.progress.current", "目前"),
        value: clampPercent(percent),
      },
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
  tr = defaultDashboardText,
}: {
  participants: ContestParticipant[];
  examEvents: ExamEvent[];
  limit?: number;
  tr?: DashboardText;
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
        statusLabel: tr("adminOverview.model.status.locked", "鎖定"),
        eventLabel:
          participant.lockReason ||
          tr("adminOverview.model.attention.examLocked", "考試已鎖定"),
        panelTarget: "participants",
      });
      continue;
    }

    if ((participant.violationCount ?? 0) > 0) {
      rows.push({
        ...common,
        kind: "violation",
        statusLabel: tr("adminOverview.model.status.anomaly", "異常"),
        eventLabel: latestEvent
          ? latestEvent.eventType
          : tr(
              "adminOverview.model.attention.anomalyCount",
              "{{count}} 次異常",
              { count: participant.violationCount ?? 0 },
            ),
        panelTarget: "logs",
      });
      continue;
    }

    if (participant.connectionStatus === "offline") {
      rows.push({
        ...common,
        kind: "offline",
        statusLabel: tr("adminOverview.model.status.offline", "離線"),
        eventLabel: tr(
          "adminOverview.model.attention.connectionInterrupted",
          "連線中斷",
        ),
        panelTarget: "participants",
      });
      continue;
    }

    if (participant.examStatus === "not_started") {
      rows.push({
        ...common,
        kind: "not_started",
        statusLabel: tr("adminOverview.model.status.notStarted", "未開始"),
        eventLabel: tr(
          "adminOverview.model.attention.notEntered",
          "尚未進入考試",
        ),
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
  tr: DashboardText = defaultDashboardText,
): DistributionItem[] => {
  const students = studentParticipants(participants);
  const total = students.length;
  const count = (predicate: (participant: ContestParticipant) => boolean) =>
    students.filter(predicate).length;

  const items = [
    {
      key: "in_progress" as const,
      label: tr("adminOverview.model.status.inProgress", "作答中"),
      value: count((p) => p.examStatus === "in_progress"),
    },
    {
      key: "not_started" as const,
      label: tr("adminOverview.model.status.notStarted", "未開始"),
      value: count((p) => p.examStatus === "not_started"),
    },
    {
      key: "submitted" as const,
      label: tr("adminOverview.model.status.submitted", "已交卷"),
      value: count((p) => p.examStatus === "submitted"),
    },
    {
      key: "locked" as const,
      label: tr("adminOverview.model.status.locked", "鎖定"),
      value: count(
        (p) => p.examStatus === "locked" || p.examStatus === "paused",
      ),
    },
    {
      key: "offline" as const,
      label: tr("adminOverview.model.status.offline", "離線"),
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
  tr: DashboardText = defaultDashboardText,
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

  const safeLabels =
    bucketLabels.length > 0
      ? bucketLabels
      : [tr("adminOverview.model.progress.current", "目前")];
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
  tr = defaultDashboardText,
}: {
  gradingPercent: number;
  gradingLabel: string;
  examProgressPercent: number;
  examEvents: ExamEvent[];
  tr?: DashboardText;
}): DashboardInsightCard[] => {
  const priorityTotal = examEvents.filter((event) => {
    const priority = getEventPriority(event.eventType);
    return priority >= 0 && priority <= 2;
  }).length;

  return [
    {
      key: "grading_progress",
      title: tr("adminOverview.model.insights.gradingProgress", "批改進度"),
      value: gradingLabel,
      kind: "progress",
      progressPercent: gradingPercent,
      series: buildProgressSeries(gradingPercent, tr),
    },
    {
      key: "exam_progress",
      title: tr("adminOverview.model.insights.examProgress", "考試進度"),
      value: `${Math.round(clampPercent(examProgressPercent))}%`,
      kind: "progress",
      progressPercent: examProgressPercent,
      series: buildProgressSeries(examProgressPercent, tr),
    },
    {
      key: "priority_events",
      title: tr("adminOverview.model.insights.priorityEvents", "異常事件"),
      value: String(priorityTotal),
      kind: "line",
      series: buildPriorityEventSeries(examEvents, tr),
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
  tr = defaultDashboardText,
}: {
  contest: ContestDetail;
  participants: ContestParticipant[];
  examEvents: ExamEvent[];
  overviewMetrics: ContestOverviewMetrics | null;
  gradingStats?: GlobalStats;
  now?: Date;
  tr?: DashboardText;
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
    tr,
  });
  const liveTimeProgress =
    overviewMetrics?.timeProgress ||
    calculateContestTimeProgressAt(contest, now.getTime());
  const gradedAnswers = gradingStats?.gradedAnswers ?? 0;
  const totalAnswers = gradingStats?.totalAnswers ?? 0;
  const gradingPercent =
    totalAnswers > 0 ? Math.round((gradedAnswers / totalAnswers) * 100) : 0;
  const gradingLabel =
    totalAnswers > 0
      ? `${gradingPercent}%`
      : tr("adminOverview.model.grading.noData", "尚無批改資料");
  const workItemCount = getWorkItemCount(contest);

  return {
    kpis: [
      {
        key: "online",
        label: tr("adminOverview.model.kpi.onlineStudents", "在線考生"),
        value: `${overviewMetrics?.onlineNow ?? 0} / ${total}`,
        tone: "neutral",
      },
      {
        key: "started",
        label: tr("adminOverview.model.kpi.started", "已開始"),
        value: String(started),
        tone: "neutral",
      },
      {
        key: "submitted",
        label: tr("adminOverview.model.status.submitted", "已交卷"),
        value: String(submitted),
        tone: "neutral",
      },
      {
        key: "locked",
        label: tr("adminOverview.model.status.locked", "鎖定"),
        value: String(locked),
        tone: locked > 0 ? "danger" : "neutral",
      },
      {
        key: "attention",
        label: tr("adminOverview.model.kpi.pendingEvents", "待處理事件"),
        value: String(attentionRows.length),
        tone: attentionRows.length > 0 ? "warning" : "neutral",
      },
    ],
    timeline: buildTimelineSummary({
      contest,
      now,
      progressPercent: liveTimeProgress.progressPercent,
      tr,
    }),
    railItems: [
      {
        key: "online",
        label: tr("adminOverview.model.status.online", "在線"),
        value: `${overviewMetrics?.onlineNow ?? 0} / ${total}`,
        tone: "neutral",
      },
      {
        key: "in_progress",
        label: tr("adminOverview.model.status.inProgress", "作答中"),
        value: String(inProgress),
        tone: "neutral",
      },
      {
        key: "not_started",
        label: tr("adminOverview.model.status.notStarted", "未開始"),
        value: String(notStarted),
        tone: notStarted > 0 ? "warning" : "neutral",
      },
      {
        key: "submitted",
        label: tr("adminOverview.model.status.submitted", "已交卷"),
        value: String(submitted),
        tone: "neutral",
      },
      {
        key: "locked_offline",
        label: tr("adminOverview.model.status.lockedOffline", "鎖定 / 離線"),
        value: `${locked} / ${offline}`,
        tone: locked > 0 || offline > 0 ? "danger" : "neutral",
      },
    ],
    insightCards: buildInsightCards({
      gradingPercent,
      gradingLabel,
      examProgressPercent: liveTimeProgress.progressPercent,
      examEvents,
      tr,
    }),
    attentionRows,
    distribution: buildDistribution(participants, tr),
    examStatus: {
      timeWindowLabel: formatWindow(contest, tr),
      remainingLabel: liveTimeProgress.isEnded
        ? tr("adminOverview.model.timeline.ended", "已結束")
        : formatDuration(liveTimeProgress.remainingSeconds),
      timeProgressPercent: liveTimeProgress.progressPercent,
      resultsLabel: contest.resultsPublished
        ? tr("adminOverview.model.results.published", "已發布")
        : tr("adminOverview.model.results.unpublished", "未發布"),
      gradingLabel,
      workItemLabel:
        contest.contestType === "paper_exam"
          ? tr("adminOverview.model.workItems.paperExam", "考卷題目")
          : tr("adminOverview.model.workItems.coding", "程式題目"),
      workItemCount,
    },
    recentEvents: buildRecentEvents(examEvents),
    nextActions: [
      {
        key: "attention",
        title: tr("adminOverview.model.nextActions.attention.title", "處理異常"),
        description:
          attentionRows.length > 0
            ? tr(
                "adminOverview.model.nextActions.attention.hasItems",
                "{{count}} 位考生需要確認",
                { count: attentionRows.length },
              )
            : tr(
                "adminOverview.model.nextActions.attention.empty",
                "目前沒有待處理異常",
              ),
        panelTarget: "participants",
        disabled: attentionRows.length === 0,
      },
      {
        key: "grading",
        title: tr("adminOverview.model.nextActions.grading.title", "前往批改"),
        description:
          totalAnswers > 0
            ? tr("adminOverview.model.nextActions.grading.progress", "已批改 {{percent}}%", {
                percent: gradingPercent,
              })
            : tr(
                "adminOverview.model.nextActions.grading.afterExam",
                "考後可開始批改",
              ),
        panelTarget: "grading",
      },
      {
        key: "results",
        title: tr("adminOverview.model.nextActions.results.title", "發布成績"),
        description: contest.resultsPublished
          ? tr("adminOverview.model.results.published", "成績已發布")
          : tr(
              "adminOverview.model.nextActions.results.readyToPublish",
              "確認批改後發布",
            ),
        panelTarget: "grading",
        disabled: contest.resultsPublished,
      },
    ],
  };
};

const contestStatusLabel = (
  status: ContestDetail["status"],
  tr: DashboardText = defaultDashboardText,
) => {
  if (status === "draft") {
    return tr("adminOverview.model.contestStatus.draft", "草稿");
  }
  if (status === "archived") {
    return tr("adminOverview.model.contestStatus.archived", "已封存");
  }
  return tr("adminOverview.model.contestStatus.published", "已發布");
};

const readinessLabel = (
  status: PreparationReadinessState,
  tr: DashboardText = defaultDashboardText,
) => {
  if (status === "done") {
    return tr("adminOverview.model.readiness.done", "完成");
  }
  if (status === "missing") {
    return tr("adminOverview.model.readiness.missing", "缺少");
  }
  return tr("adminOverview.model.readiness.warning", "待確認");
};

export const buildAdminPreparationDashboard = ({
  contest,
  participants,
  gradingStats,
  now = new Date(),
  tr = defaultDashboardText,
}: {
  contest: ContestDetail;
  participants: ContestParticipant[];
  gradingStats?: GlobalStats;
  now?: Date;
  tr?: DashboardText;
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
  const gradingLabel =
    totalAnswers > 0
      ? `${gradingPercent}%`
      : tr("adminOverview.model.common.noData", "尚無資料");
  const workItemLabel =
    contest.contestType === "paper_exam"
      ? tr("adminOverview.model.workItems.paperExam", "考卷題目")
      : tr("adminOverview.model.workItems.coding", "程式題目");
  const publishState: PreparationReadinessState =
    contest.status === "published" ? "done" : "warning";

  const checklistItems: PreparationChecklistItem[] = [
    {
      key: "publish",
      label: tr("adminOverview.model.preparation.publish", "競賽發布"),
      status: publishState,
      statusLabel: readinessLabel(publishState, tr),
      description:
        contest.status === "published"
          ? tr(
              "adminOverview.model.preparation.publishedDescription",
              "參賽者可依權限進入競賽",
            )
          : tr(
              "adminOverview.model.preparation.currentStatus",
              "目前狀態：{{status}}",
              { status: contestStatusLabel(contest.status, tr) },
            ),
    },
    {
      key: "work_items",
      label: workItemLabel,
      status: workItemCount > 0 ? "done" : "missing",
      statusLabel: readinessLabel(workItemCount > 0 ? "done" : "missing", tr),
      description:
        workItemCount > 0
          ? tr("adminOverview.model.preparation.workItemsReady", "已設定 {{count}} 題", {
              count: workItemCount,
            })
          : tr(
              "adminOverview.model.preparation.workItemsMissing",
              "尚未建立可作答的題目",
            ),
    },
    {
      key: "schedule",
      label: tr("adminOverview.model.preparation.schedule", "考試時段"),
      status: scheduleReady ? "done" : "missing",
      statusLabel: readinessLabel(scheduleReady ? "done" : "missing", tr),
      description: scheduleReady
        ? formatWindow(contest, tr)
        : tr(
            "adminOverview.model.preparation.scheduleMissing",
            "開始與結束時間未完整設定",
          ),
    },
    {
      key: "participants",
      label: tr("adminOverview.model.preparation.participantList", "參賽者名單"),
      status: participantTotal > 0 ? "done" : "warning",
      statusLabel: readinessLabel(participantTotal > 0 ? "done" : "warning", tr),
      description:
        participantTotal > 0
          ? tr(
              "adminOverview.model.preparation.participantCount",
              "{{count}} 位參賽者",
              { count: participantTotal },
            )
          : tr(
              "adminOverview.model.preparation.participantsMissing",
              "尚未看到參賽者資料",
            ),
    },
    {
      key: "rules",
      label: tr("adminOverview.model.preparation.rules", "作答規則"),
      status: hasRules ? "done" : "warning",
      statusLabel: readinessLabel(hasRules ? "done" : "warning", tr),
      description: hasRules
        ? tr("adminOverview.model.preparation.rulesReady", "已填寫規則說明")
        : tr(
            "adminOverview.model.preparation.rulesMissing",
            "可補上考試規則與注意事項",
          ),
    },
    {
      key: "anti_cheat",
      label: tr("adminOverview.model.preparation.antiCheat", "防作弊設定"),
      status: contest.cheatDetectionEnabled ? "done" : "warning",
      statusLabel: readinessLabel(
        contest.cheatDetectionEnabled ? "done" : "warning",
        tr,
      ),
      description: contest.cheatDetectionEnabled
        ? tr(
            "adminOverview.model.preparation.antiCheatEnabled",
            "防作弊監控已啟用",
          )
        : tr(
            "adminOverview.model.preparation.antiCheatOptional",
            "可依考試需求啟用",
          ),
    },
  ];

  return {
    timeline: buildTimelineSummary({
      contest,
      now,
      tr,
    }),
    railItems: [
      {
        key: "status",
        label: tr("adminOverview.model.summary.status", "競賽狀態"),
        value: contestStatusLabel(contest.status, tr),
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
        label: tr("adminOverview.model.summary.participants", "參賽者"),
        value: String(participantTotal),
        tone: participantTotal > 0 ? "neutral" : "warning",
      },
      {
        key: "anti_cheat",
        label: tr("adminOverview.model.summary.antiCheat", "防作弊"),
        value: contest.cheatDetectionEnabled
          ? tr("adminOverview.model.common.enabled", "已啟用")
          : tr("adminOverview.model.common.disabled", "未啟用"),
        tone: contest.cheatDetectionEnabled ? "neutral" : "warning",
      },
      {
        key: "results",
        label: tr("adminOverview.model.summary.results", "成績"),
        value: contest.resultsPublished
          ? tr("adminOverview.model.results.published", "已發布")
          : tr("adminOverview.model.results.unpublished", "未發布"),
        tone: contest.resultsPublished ? "neutral" : "warning",
      },
    ],
    insightCards: buildInsightCards({
      gradingPercent,
      gradingLabel,
      examProgressPercent: buildTimelineSummary({ contest, now, tr })
        .progressPercent,
      examEvents: [],
      tr,
    }),
    summaryItems: [
      {
        key: "status",
        label: tr("adminOverview.model.summary.status", "競賽狀態"),
        value: contestStatusLabel(contest.status, tr),
        description:
          contest.status === "published"
            ? tr("adminOverview.model.summary.statusOpen", "已開放給參賽者")
            : tr("adminOverview.model.summary.statusClosed", "尚未正式開放"),
        tone: contest.status === "published" ? "neutral" : "warning",
      },
      {
        key: "schedule",
        label: tr("adminOverview.model.preparation.schedule", "考試時段"),
        value: formatWindow(contest, tr),
        description: scheduleReady
          ? tr("adminOverview.model.summary.scheduleReady", "時間設定完整")
          : tr("adminOverview.model.summary.scheduleMissing", "需要補齊時間"),
        tone: scheduleReady ? "neutral" : "danger",
      },
      {
        key: "work_items",
        label: workItemLabel,
        value: String(workItemCount),
        description:
          workItemCount > 0
            ? tr("adminOverview.model.summary.workItemsReady", "內容已建立")
            : tr("adminOverview.model.summary.workItemsMissing", "尚未建立內容"),
        tone: workItemCount > 0 ? "neutral" : "danger",
      },
      {
        key: "participants",
        label: tr("adminOverview.model.summary.participants", "參賽者"),
        value: String(participantTotal),
        description:
          participantTotal > 0
            ? tr("adminOverview.model.summary.participantsReady", "名單可供管理")
            : tr(
                "adminOverview.model.summary.participantsMissing",
                "尚無參賽者資料",
              ),
        tone: participantTotal > 0 ? "neutral" : "warning",
      },
      {
        key: "grading",
        label: tr("adminOverview.model.insights.gradingProgress", "批改進度"),
        value: gradingLabel,
        description:
          totalAnswers > 0
            ? tr("adminOverview.model.summary.gradingCount", "{{graded}} / {{total}} 份", {
                graded: gradedAnswers,
                total: totalAnswers,
              })
            : tr(
                "adminOverview.model.summary.gradingAfterExam",
                "考後才會產生批改資料",
              ),
        tone: ungradedAnswers > 0 ? "warning" : "neutral",
      },
      {
        key: "results",
        label: tr("adminOverview.model.summary.results", "成績"),
        value: contest.resultsPublished
          ? tr("adminOverview.model.results.published", "已發布")
          : tr("adminOverview.model.results.unpublished", "未發布"),
        description: contest.resultsPublished
          ? tr("adminOverview.model.summary.resultsVisible", "參賽者可查看")
          : tr(
              "adminOverview.model.nextActions.results.readyToPublish",
              "確認批改後發布",
            ),
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
          : tr("adminOverview.model.grading.noAnswers", "尚無作答資料"),
      resultsLabel: contest.resultsPublished
        ? tr("adminOverview.model.results.published", "已發布")
        : tr("adminOverview.model.results.unpublished", "未發布"),
      resultsTone: contest.resultsPublished ? "neutral" : "warning",
    },
  };
};
