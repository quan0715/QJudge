import type { ContestParticipant } from "@/core/entities/contest.entity";

export type ParticipantStatusFilter =
  | "all"
  | "needs_attention"
  | "in_progress"
  | "submitted"
  | "locked"
  | "paused"
  | "not_started";

export const PARTICIPANT_STATUS_FILTERS: Array<{
  id: ParticipantStatusFilter;
  labelKey: string;
  defaultLabel: string;
}> = [
  { id: "all", labelKey: "adminOverview.command.filters.allStatuses", defaultLabel: "全部狀態" },
  { id: "needs_attention", labelKey: "adminOverview.command.filters.needsAttention", defaultLabel: "需要處理" },
  { id: "in_progress", labelKey: "examStatus.in_progress", defaultLabel: "作答中" },
  { id: "submitted", labelKey: "examStatus.submitted", defaultLabel: "已交卷" },
  { id: "locked", labelKey: "examStatus.locked", defaultLabel: "鎖定" },
  { id: "paused", labelKey: "examStatus.paused", defaultLabel: "暫停" },
  { id: "not_started", labelKey: "examStatus.not_started", defaultLabel: "未開始" },
];

const NEEDS_ATTENTION_STATUSES = new Set(["locked", "paused"]);

export const getParticipantDisplayName = (participant: ContestParticipant) =>
  participant.displayName || participant.username;

export const isParticipantLive = (participant: ContestParticipant) =>
  Boolean(participant.liveMonitoringOnline) || participant.connectionStatus === "live";

export const needsAttention = (participant: ContestParticipant) =>
  (participant.violationCount ?? 0) > 0 ||
  NEEDS_ATTENTION_STATUSES.has(participant.examStatus ?? "");

export const getAttentionScore = (participant: ContestParticipant) => {
  let score = 0;
  if (participant.examStatus === "locked") score += 1000;
  if (participant.examStatus === "paused") score += 700;
  score += (participant.violationCount ?? 0) * 80;
  if (participant.examStatus === "in_progress" && !isParticipantLive(participant)) score += 120;
  if (isParticipantLive(participant)) score += 20;
  return score;
};

export const sortParticipantsByAttention = (participants: ContestParticipant[]) =>
  [...participants].sort(
    (left, right) =>
      getAttentionScore(right) - getAttentionScore(left) ||
      getParticipantDisplayName(left).localeCompare(getParticipantDisplayName(right), "zh-TW"),
  );

export const filterParticipants = (
  participants: ContestParticipant[],
  { query, status }: { query: string; status: ParticipantStatusFilter },
) => {
  const normalizedQuery = query.trim().toLowerCase();
  return participants.filter((participant) => {
    if (status === "needs_attention") {
      if (!needsAttention(participant)) return false;
    } else if (status !== "all" && participant.examStatus !== status) {
      return false;
    }
    if (!normalizedQuery) return true;
    return [
      getParticipantDisplayName(participant),
      participant.username,
      participant.email,
      participant.lockReason,
      participant.submitReason,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedQuery));
  });
};
