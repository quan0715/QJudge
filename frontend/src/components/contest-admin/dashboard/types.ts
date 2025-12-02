export interface ContestSummary {
  contestId: string;
  title: string;
  totalParticipants: number;
  totalProblems: number;
  totalSubmissions: number;
  avgSolvedCount: number;
  avgCompletionRate: number;
  zeroSolvedCount: number;
  fullSolvedCount: number;
}

export interface ProblemStats {
  problemId: string;
  index: number;
  title: string;
  acceptedUsers: number;
  attemptedUsers: number;
  totalSubmissions: number;
  averageSubmissionsPerUser?: number;
}

export interface ParticipantStats {
  userId: string;
  username: string;
  solvedCount: number;
  totalSubmissions: number;
  lastSubmissionAt?: string;
}
