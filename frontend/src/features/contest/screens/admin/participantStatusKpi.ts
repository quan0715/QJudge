import type { ContestParticipant } from "@/core/entities/contest.entity";

export interface ParticipantStatusKpi {
  totalParticipants: number;
  submittedCount: number;
  inProgressCount: number;
  pausedOrLockedCount: number;
  notStartedCount: number;
}

export const computeParticipantStatusKpi = (
  participants: ContestParticipant[]
): ParticipantStatusKpi => {
  const submittedCount = participants.filter(
    (p) => p.examStatus === "submitted"
  ).length;
  const inProgressCount = participants.filter(
    (p) => p.examStatus === "in_progress"
  ).length;
  const pausedOrLockedCount = participants.filter(
    (p) =>
      p.examStatus === "paused" ||
      p.examStatus === "locked" ||
      p.examStatus === "locked_takeover"
  ).length;
  const notStartedCount = participants.filter(
    (p) => p.examStatus === "not_started"
  ).length;

  return {
    totalParticipants: participants.length,
    submittedCount,
    inProgressCount,
    pausedOrLockedCount,
    notStartedCount,
  };
};
