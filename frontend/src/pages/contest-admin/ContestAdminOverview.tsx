import { useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { ContestDetail } from '@/models/contest';
import ContestAdminDashboard from '@/components/contest-admin/dashboard/ContestAdminDashboard';
import type { ContestSummary, ProblemStats, ParticipantStats } from '@/components/contest-admin/dashboard/types';

const ContestAdminOverview = () => {
  const { contest } = useOutletContext<{ contest: ContestDetail }>();

  // Mock Data Generation
  const { summary, problems, participants } = useMemo(() => {
    const mockSummary: ContestSummary = {
      contestId: contest.id,
      title: contest.name,
      totalParticipants: 45,
      totalProblems: 5,
      totalSubmissions: 128,
      avgSolvedCount: 2.4,
      avgCompletionRate: 0.48,
      zeroSolvedCount: 5,
      fullSolvedCount: 8,
    };

    const mockProblems: ProblemStats[] = [
      { problemId: 'p1', index: 1, title: 'Two Sum', acceptedUsers: 40, attemptedUsers: 45, totalSubmissions: 50 },
      { problemId: 'p2', index: 2, title: 'Longest Substring', acceptedUsers: 30, attemptedUsers: 42, totalSubmissions: 60 },
      { problemId: 'p3', index: 3, title: 'Median of Two Arrays', acceptedUsers: 15, attemptedUsers: 35, totalSubmissions: 80 },
      { problemId: 'p4', index: 4, title: 'Valid Parentheses', acceptedUsers: 38, attemptedUsers: 40, totalSubmissions: 45 },
      { problemId: 'p5', index: 5, title: 'Merge K Lists', acceptedUsers: 5, attemptedUsers: 20, totalSubmissions: 55 },
    ];

    const mockParticipants: ParticipantStats[] = Array.from({ length: 45 }, (_, i) => ({
      userId: `u${i}`,
      username: `student_${i + 1}`,
      solvedCount: Math.floor(Math.random() * 6), // 0 to 5
      totalSubmissions: Math.floor(Math.random() * 10) + 1,
      lastSubmissionAt: new Date().toISOString(),
    }));

    return { summary: mockSummary, problems: mockProblems, participants: mockParticipants };
  }, [contest.id, contest.name]);

  return (
    <ContestAdminDashboard 
      summary={summary}
      problems={problems}
      participants={participants}
    />
  );
};

export default ContestAdminOverview;
