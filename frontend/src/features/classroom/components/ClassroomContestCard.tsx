import type { BoundContest } from "@/core/entities/classroom.entity";
import type { Contest } from "@/core/entities/contest.entity";
import { ContestPreviewCard } from "@/features/contest/components/ContestPreviewCard";

interface ClassroomContestCardProps {
  contest: BoundContest;
  onNavigate: () => void;
}

export const ClassroomContestCard: React.FC<ClassroomContestCardProps> = ({ contest, onNavigate }) => {
  const contestCardData: Contest = {
    id: contest.contestId,
    name: contest.contestName,
    description: contest.contestDescription,
    startTime: contest.contestStartTime || contest.boundAt,
    endTime: contest.contestEndTime || contest.boundAt,
    status: contest.contestStatus,
    visibility: contest.contestVisibility,
    attendanceCheckEnabled: contest.attendanceCheckEnabled,
    resultsPublished: contest.resultsPublished,
    organizer: undefined,
    hasJoined: true,
    isRegistered: true,
    participantCount: contest.participantCount,
  };

  return <ContestPreviewCard contest={contestCardData} onSelect={onNavigate} />;
};

export const getActivityTimestamp = (contest: BoundContest): string =>
  contest.contestStartTime || contest.boundAt;
