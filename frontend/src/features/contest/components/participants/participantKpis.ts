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
