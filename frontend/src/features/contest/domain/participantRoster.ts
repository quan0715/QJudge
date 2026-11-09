import type { ContestParticipant } from "@/core/entities/contest.entity";

export type ParticipantScoreFilter = "all" | "top" | "bottom" | "zero";

export const PARTICIPANT_SCORE_FILTERS: Array<{
  id: ParticipantScoreFilter;
  labelKey: string;
  defaultLabel: string;
}> = [
  { id: "all", labelKey: "participantsPanel.scoreFilter.all", defaultLabel: "全部分數" },
  { id: "top", labelKey: "participantsPanel.scoreFilter.top", defaultLabel: "前 25%" },
  { id: "bottom", labelKey: "participantsPanel.scoreFilter.bottom", defaultLabel: "後 25%" },
  { id: "zero", labelKey: "participantsPanel.scoreFilter.zero", defaultLabel: "0 分" },
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

export const sortParticipantsByScore = (participants: ContestParticipant[]) =>
  [...participants].sort(
    (left, right) =>
      (right.score ?? 0) - (left.score ?? 0) ||
      getParticipantDisplayName(left).localeCompare(getParticipantDisplayName(right), "zh-TW"),
  );

// A quarter of the class, counted from either end; ties at the cut stay in.
const quarterCutoff = (participants: ContestParticipant[], end: "top" | "bottom") => {
  const scores = participants.map((participant) => participant.score ?? 0).sort((a, b) => a - b);
  const size = Math.max(1, Math.ceil(scores.length / 4));
  return end === "top" ? scores[scores.length - size] : scores[size - 1];
};

export const filterParticipants = (
  participants: ContestParticipant[],
  { query, score }: { query: string; score: ParticipantScoreFilter },
) => {
  const normalizedQuery = query.trim().toLowerCase();
  const cutoff = score === "top" || score === "bottom" ? quarterCutoff(participants, score) : 0;
  return participants.filter((participant) => {
    const value = participant.score ?? 0;
    if (score === "top" && value < cutoff) return false;
    if (score === "bottom" && value > cutoff) return false;
    if (score === "zero" && value !== 0) return false;
    if (!normalizedQuery) return true;
    return [
      getParticipantDisplayName(participant),
      participant.username,
      participant.email,
      participant.lockReason,
      participant.submitReason,
    ]
      .filter(Boolean)
      .some((field) => String(field).toLowerCase().includes(normalizedQuery));
  });
};
