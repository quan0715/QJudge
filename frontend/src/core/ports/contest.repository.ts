import type {
  Contest,
  ContestDetail,
  ContestStatus,
  ContestVisibility,
  ScoreboardData,
  ContestParticipant,
  ContestProblemSummary,
  ExamEvent,
  Clarification,
  ContestAnnouncement,
  ContestQuestion,
} from "@/core/entities/contest.entity";
import type { ProblemDetail } from "@/core/entities/problem.entity";
import type { Submission } from "@/core/entities/submission.entity";

// ============================================================================
// Contest Core Operations
// ============================================================================

export interface IContestRepository {
  // Contest CRUD
  getContests(scope?: string): Promise<Contest[]>;
  getContest(id: string): Promise<ContestDetail | undefined>;
  createContest(data: ContestCreatePayload): Promise<Contest>;
  updateContest(id: string, data: ContestUpdatePayload): Promise<Contest>;
  deleteContest(id: string): Promise<void>;

  // Contest Actions
  toggleStatus(id: string): Promise<{ status: string }>;
  registerContest(
    id: string,
    data?: { password?: string; nickname?: string }
  ): Promise<void>;
  enterContest(id: string): Promise<void>;
  leaveContest(id: string): Promise<void>;
  endContest(id: string): Promise<void>;
  archiveContest(id: string): Promise<void>;

  // Scoreboard
  getScoreboard(contestId: string): Promise<ScoreboardData>;
  getContestStandings(id: string): Promise<ScoreboardData>;
}

// ============================================================================
// Contest Problems Operations
// ============================================================================

export interface IContestProblemRepository {
  getContestProblems(contestId: string): Promise<ContestProblemSummary[]>;
  getContestProblem(
    contestId: string,
    problemLabel: string
  ): Promise<ProblemDetail | undefined>;
  addProblemToContest(
    contestId: string,
    problemId: string,
    data?: { label?: string; score?: number }
  ): Promise<void>;
  removeProblemFromContest(contestId: string, problemId: string): Promise<void>;
  reorderProblems(
    contestId: string,
    orderedIds: string[]
  ): Promise<ContestProblemSummary[]>;
  importProblems(
    contestId: string,
    problemIds: string[]
  ): Promise<ContestProblemSummary[]>;
}

// ============================================================================
// Contest Participants Operations
// ============================================================================

export interface IContestParticipantRepository {
  getParticipants(contestId: string): Promise<ContestParticipant[]>;
  addParticipant(
    contestId: string,
    data: { user_id?: string; username?: string }
  ): Promise<ContestParticipant>;
  removeParticipant(contestId: string, participantId: string): Promise<void>;
}

// ============================================================================
// Contest Submissions Operations
// ============================================================================

export interface IContestSubmissionRepository {
  getContestSubmissions(
    contestId: string,
    params?: {
      problem?: string;
      user?: string;
      status?: string;
      page?: number;
      page_size?: number;
    }
  ): Promise<{ results: Submission[]; count: number }>;
}

// ============================================================================
// Exam Mode Operations
// ============================================================================

export interface IExamRepository {
  getExamEvents(
    contestId: string,
    params?: { user_id?: string }
  ): Promise<ExamEvent[]>;
  unlockParticipant(contestId: string, participantId: string): Promise<void>;
  lockParticipant(
    contestId: string,
    participantId: string,
    reason: string
  ): Promise<void>;
}

// ============================================================================
// Clarifications & Announcements
// ============================================================================

export interface IClarificationRepository {
  getClarifications(contestId: string): Promise<Clarification[]>;
  createClarification(
    contestId: string,
    data: { question: string; problem_id?: string }
  ): Promise<Clarification>;
  answerClarification(
    contestId: string,
    clarificationId: string,
    data: { answer: string; is_public?: boolean }
  ): Promise<Clarification>;
}

export interface IContestAnnouncementRepository {
  getAnnouncements(contestId: string): Promise<ContestAnnouncement[]>;
  createAnnouncement(
    contestId: string,
    data: { title: string; content: string }
  ): Promise<ContestAnnouncement>;
  updateAnnouncement(
    contestId: string,
    announcementId: string,
    data: { title?: string; content?: string }
  ): Promise<ContestAnnouncement>;
  deleteAnnouncement(contestId: string, announcementId: string): Promise<void>;
}

export interface IContestQuestionRepository {
  getQuestions(contestId: string): Promise<ContestQuestion[]>;
  createQuestion(
    contestId: string,
    data: { title: string; content: string }
  ): Promise<ContestQuestion>;
  answerQuestion(
    contestId: string,
    questionId: string,
    data: { answer: string; is_public?: boolean }
  ): Promise<ContestQuestion>;
}

// ============================================================================
// Payload Types
// ============================================================================

export interface ContestCreatePayload {
  name: string;
  description?: string;
  rules?: string;
  start_time: string;
  end_time: string;
  visibility?: "public" | "private" | "password";
  password?: string;
  exam_mode_enabled?: boolean;
  scoreboard_visible_during_contest?: boolean;
  anonymous_mode_enabled?: boolean;
}

export interface ContestUpdatePayload {
  name?: string;
  description?: string;
  rules?: string;
  startTime?: string;
  endTime?: string;
  status?: ContestStatus;
  visibility?: ContestVisibility;
  password?: string;
  examModeEnabled?: boolean;
  scoreboardVisibleDuringContest?: boolean;
  anonymousModeEnabled?: boolean;
  allowMultipleJoins?: boolean;
  maxCheatWarnings?: number;
  allowAutoUnlock?: boolean;
  autoUnlockMinutes?: number;
}
