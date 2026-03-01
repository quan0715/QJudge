import type { ContestParticipant } from "@/core/entities/contest.entity";

export interface DashboardKpi {
  totalParticipants: number;
  submittedCount: number;
  inProgressCount: number;
  lockedCount: number;
  notStartedCount: number;
  totalSubmissions: number;
  acceptRate: number;
  averageScore: number;
  highestScore: number;
  totalViolations: number;
}

/**
 * Mock KPI model for admin overview.
 * Submissions / accept rate are placeholders until backend KPI API is ready.
 */
export const computeMockKpi = (
  participants: ContestParticipant[]
): DashboardKpi => {
  const submittedCount = participants.filter(
    (p) => p.examStatus === "submitted"
  ).length;
  const inProgressCount = participants.filter(
    (p) => p.examStatus === "in_progress"
  ).length;
  const lockedCount = participants.filter(
    (p) => p.examStatus === "locked"
  ).length;
  const notStartedCount = participants.filter(
    (p) => p.examStatus === "not_started"
  ).length;
  const scores = participants.filter((p) => p.score > 0).map((p) => p.score);
  const totalViolations = participants.reduce(
    (sum, p) => sum + p.violationCount,
    0
  );

  return {
    totalParticipants: participants.length,
    submittedCount,
    inProgressCount,
    lockedCount,
    notStartedCount,
    totalSubmissions: 156, // mock
    acceptRate: 68.5, // mock percentage
    averageScore:
      scores.length > 0
        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) /
          10
        : 0,
    highestScore: scores.length > 0 ? Math.max(...scores) : 0,
    totalViolations,
  };
};
