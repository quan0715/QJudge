import type { ContestParticipant } from "@/core/entities/contest.entity";

export interface ParticipantStatusKpi {
  totalParticipants: number;
  submittedCount: number;
  inProgressCount: number;
  pausedOrLockedCount: number;
  notStartedCount: number;
}

export const computeParticipantStatusKpi = (
  participants: ContestParticipant[],
  studentsOnly = true,
): ParticipantStatusKpi => {
  const filtered = studentsOnly
    ? participants.filter((p) => !p.accountRole || p.accountRole === "student")
    : participants;
  const submittedCount = filtered.filter(
    (p) => p.examStatus === "submitted"
  ).length;
  const inProgressCount = filtered.filter(
    (p) => p.examStatus === "in_progress"
  ).length;
  const pausedOrLockedCount = filtered.filter(
    (p) =>
      p.examStatus === "paused" ||
      p.examStatus === "locked" ||
      p.examStatus === "locked_takeover"
  ).length;
  const notStartedCount = filtered.filter(
    (p) => p.examStatus === "not_started"
  ).length;

  return {
    totalParticipants: filtered.length,
    submittedCount,
    inProgressCount,
    pausedOrLockedCount,
    notStartedCount,
  };
};
