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

export interface AdminOverviewDashboardData {
  kpis: OverviewKpiItem[];
  attentionRows: TeacherAttentionRow[];
  distribution: DistributionItem[];
  examStatus: ExamStatusSummary;
  recentEvents: RecentExamEventItem[];
  nextActions: NextActionItem[];
}

const studentParticipants = (participants: ContestParticipant[]) =>
  participants.filter(
    (participant) =>
      !participant.accountRole || participant.accountRole === "student",
  );

const displayName = (participant: ContestParticipant) =>
  participant.displayName ||
  participant.userDisplayName ||
  participant.username ||
  participant.userId;

const formatTime = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleTimeString("zh-TW", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatWindow = (contest: ContestDetail) => {
  const start = formatTime(contest.startTime);
  const end = formatTime(contest.endTime);
  if (start === "-" || end === "-") return "未設定";
  return `${start}-${end}`;
};

const percentage = (value: number, total: number) =>
  total <= 0 ? 0 : Math.round((value / total) * 100);

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
      studentName: displayName(participant),
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
      value: count((p) => p.examStatus === "locked" || p.examStatus === "paused"),
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
  const workItemCount =
    contest.contestType === "paper_exam"
      ? contest.examQuestionsCount
      : contest.problems.length;

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
    attentionRows,
    distribution: buildDistribution(participants),
    examStatus: {
      timeWindowLabel: formatWindow(contest),
      remainingLabel: liveTimeProgress.isEnded
        ? "已結束"
        : formatDuration(liveTimeProgress.remainingSeconds),
      timeProgressPercent: liveTimeProgress.progressPercent,
      resultsLabel: contest.resultsPublished ? "已發布" : "未發布",
      gradingLabel: totalAnswers > 0 ? `${gradingPercent}%` : "尚無批改資料",
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
        description: totalAnswers > 0 ? `已批改 ${gradingPercent}%` : "考後可開始批改",
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
