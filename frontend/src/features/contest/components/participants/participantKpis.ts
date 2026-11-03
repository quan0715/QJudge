import i18n from "i18next";
import type { ParticipantDashboard } from "@/core/entities/contest.entity";
import { formatScore } from "@/features/contest/utils/scoreFormat";

type Translate = (key: string, fallback: string) => string;

export interface ParticipantKpi {
  key: "time" | "score" | "accuracy" | "progress" | "violations";
  label: string;
  value: string;
  tone?: "danger";
}

const formatClockTime = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "-"
    : date.toLocaleTimeString(i18n.language || undefined, { hour: "2-digit", minute: "2-digit" });
};

export const getParticipantKpis = (
  dashboard: ParticipantDashboard,
  { showViolations, t }: { showViolations: boolean; t: Translate },
): ParticipantKpi[] => {
  const { overview, participant } = dashboard;
  const accuracy = overview.correctRate ?? overview.acceptedRate ?? null;
  const progress =
    dashboard.contestType === "paper_exam"
      ? `${overview.gradedCount ?? 0} / ${overview.totalQuestions ?? 0}`
      : `${overview.solved ?? 0} / ${overview.totalProblems ?? 0}`;
  const violations = participant.violationCount ?? 0;
  const kpis: ParticipantKpi[] = [
    {
      key: "time",
      label: t("dashboard.answerTime", "作答時間"),
      value: `${formatClockTime(participant.startedAt)} → ${formatClockTime(participant.leftAt)}`,
    },
    {
      key: "score",
      label: t("dashboard.score", "分數"),
      value: `${formatScore(overview.totalScore)} / ${formatScore(overview.maxScore)} ${t("dashboard.pointsUnit", "分")}`,
    },
    {
      key: "accuracy",
      label: t("dashboard.correctRate", "正確率"),
      value: accuracy != null ? `${accuracy}%` : "-",
    },
    {
      key: "progress",
      label: t("dashboard.gradingProgress", "批改進度"),
      value: `${progress} ${t("dashboard.questionUnit", "題")}`,
    },
  ];
  if (showViolations) {
    kpis.push({
      key: "violations",
      label: t("dashboard.violations", "違規次數"),
      value: `${violations} ${t("dashboard.countUnit", "次")}`,
      tone: violations > 0 ? "danger" : undefined,
    });
  }
  return kpis;
};

export interface ParticipantLiveSignal {
  key: "connection" | "live" | "screen" | "webcam";
  label: string;
  value: string;
  tone: "success" | "muted";
}

/** The drawer's 即時狀態 rows: exam connection, live monitoring, screen share and webcam. */
export const getParticipantLiveSignals = (
  participant: ParticipantDashboard["participant"],
  t: Translate,
): ParticipantLiveSignal[] => {
  const sources = participant.liveMonitoringSources ?? [];
  const signal = (on: boolean, onLabel: string, offLabel: string) => ({
    value: on ? onLabel : offLabel,
    tone: on ? ("success" as const) : ("muted" as const),
  });
  const connected = t("dashboard.signalConnected", "已連線");
  const missing = t("dashboard.signalMissing", "未偵測");
  return [
    {
      key: "connection",
      label: t("dashboard.examConnection", "考試連線"),
      ...signal(
        Boolean(participant.lastCheckpointAt),
        t("participants.connection.online", "在線"),
        t("participants.connection.offline", "離線"),
      ),
    },
    {
      key: "live",
      label: t("dashboard.liveMonitoringSignal", "即時監看"),
      ...signal(
        Boolean(participant.liveMonitoringOnline),
        t("participants.connection.live", "Live"),
        t("participants.connection.offline", "離線"),
      ),
    },
    {
      key: "screen",
      label: t("dashboard.screenShareSignal", "螢幕分享"),
      ...signal(sources.includes("screen_share"), connected, missing),
    },
    {
      key: "webcam",
      label: t("dashboard.webcamSignal", "Webcam"),
      ...signal(sources.includes("webcam"), connected, missing),
    },
  ];
};
