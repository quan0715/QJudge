import type {
  ContestParticipant,
  ContestType,
  EventFeedItem,
  ExamQuestionType,
  ParticipantCodingProblemDetail,
  ParticipantCodingProblemRow,
  ParticipantCodingTrendPoint,
  ParticipantDashboard,
  ParticipantDashboardStatus,
  ParticipantDashboardTimelineItem,
  ParticipantOverviewSummary,
  ParticipantPaperQuestionDetail,
  ParticipantPaperReportOverviewRow,
} from "@/core/entities/contest.entity";
import type {
  ContestParticipantDto,
  EventFeedItemDto,
  ParticipantCodingProblemRowDto,
  ParticipantDashboardDto,
  ParticipantDashboardStatusDto,
  ParticipantPaperReportRowDto,
  ParticipantTimelineItemDto,
} from "@/infrastructure/api/dto/contest.dto";

export function mapContestParticipantDto(
  dto: ContestParticipantDto,
): ContestParticipant {
  return {
    userId: dto.user_id?.toString() || "",
    username: dto.username || "",
    email: dto.user?.email,
    displayName: dto.display_name || dto.user?.profile?.display_name || "",
    accountRole: dto.account_role || dto.user?.role || "",
    authProvider: dto.auth_provider || dto.user?.auth_provider || "",
    connectionStatus:
      dto.connection_status === "live" || dto.connection_status === "online"
        ? dto.connection_status
        : "offline",
    lastHeartbeatAt: dto.last_heartbeat_at ?? null,
    liveMonitoringOnline: !!dto.live_monitoring_online,
    liveMonitoringSources: Array.isArray(dto.live_monitoring_sources)
      ? dto.live_monitoring_sources.filter(
          (source) => source === "screen_share" || source === "webcam",
        )
      : [],
    score: dto.total_score ?? dto.score ?? 0,
    rank: dto.rank,
    joinedAt: dto.joined_at || "",
    examStatus: dto.exam_status || "not_started",
    lockReason: dto.lock_reason,
    violationCount: dto.violation_count || 0,
    submitReason: dto.submit_reason,
  };
}

const mapParticipantDashboardStatusDto = (
  dto: ParticipantDashboardStatusDto,
): ParticipantDashboardStatus => ({
  code: dto?.code || "",
  label: dto?.label || "",
  color: dto?.color || "gray",
});

const mapParticipantTimelineDto = (
  dto: ParticipantTimelineItemDto,
): ParticipantDashboardTimelineItem => ({
  id: dto?.id?.toString() || "",
  source: dto?.source === "exam_event" ? "exam_event" : "activity",
  eventType: dto?.event_type || "",
  timestamp: dto?.timestamp || "",
  message: dto?.message || "",
  metadata: dto?.metadata || {},
});

const mapParticipantOverviewDto = (dto: any): ParticipantOverviewSummary => ({
  totalScore: Number(dto?.total_score ?? 0),
  maxScore: Number(dto?.max_score ?? 0),
  solved: dto?.solved != null ? Number(dto.solved) : undefined,
  totalProblems:
    dto?.total_problems != null ? Number(dto.total_problems) : undefined,
  rank: dto?.rank != null ? Number(dto.rank) : null,
  totalParticipants:
    dto?.total_participants != null
      ? Number(dto.total_participants)
      : undefined,
  effectiveSubmissions:
    dto?.effective_submissions != null
      ? Number(dto.effective_submissions)
      : undefined,
  acceptedSubmissions:
    dto?.accepted_submissions != null
      ? Number(dto.accepted_submissions)
      : undefined,
  acceptedRate:
    dto?.accepted_rate != null ? Number(dto.accepted_rate) : undefined,
  correctRate: dto?.correct_rate != null ? Number(dto.correct_rate) : undefined,
  gradedCount: dto?.graded_count != null ? Number(dto.graded_count) : undefined,
  totalQuestions:
    dto?.total_questions != null ? Number(dto.total_questions) : undefined,
});

const mapPaperOverviewRowDto = (
  dto: ParticipantPaperReportRowDto,
): ParticipantPaperReportOverviewRow => ({
  questionId: dto?.question_id?.toString() || "",
  index: Number(dto?.index ?? 0),
  questionType: (dto?.question_type || "essay") as ExamQuestionType,
  status: mapParticipantDashboardStatusDto(dto?.status || {}),
  score: dto?.score != null ? Number(dto.score) : null,
  maxScore: Number(dto?.max_score ?? 0),
  scorePolicy: dto?.score_policy || undefined,
});

const mapPaperQuestionDetailDto = (
  dto: any,
): ParticipantPaperQuestionDetail => ({
  questionId: dto?.question_id?.toString() || "",
  index: Number(dto?.index ?? 0),
  questionType: (dto?.question_type || "essay") as ExamQuestionType,
  prompt: dto?.prompt || "",
  options: Array.isArray(dto?.options)
    ? dto.options.map((item: unknown) => String(item))
    : [],
  correctAnswer: dto?.correct_answer,
  explanation: dto?.explanation || "",
  answer: dto?.answer || {},
  score: dto?.score != null ? Number(dto.score) : null,
  maxScore: Number(dto?.max_score ?? 0),
  feedback: dto?.feedback || "",
  gradedByUsername: dto?.graded_by_username || null,
  gradedAt: dto?.graded_at || null,
  isCorrect: dto?.is_correct ?? null,
  status: mapParticipantDashboardStatusDto(dto?.status || {}),
  scorePolicy: dto?.score_policy || undefined,
});

const mapCodingProblemRowDto = (
  dto: ParticipantCodingProblemRowDto,
): ParticipantCodingProblemRow => ({
  problemId: dto?.problem_id?.toString() || "",
  label: dto?.label || "",
  title: dto?.title || "",
  difficulty: dto?.difficulty || null,
  status: dto?.status || null,
  score: Number(dto?.score ?? 0),
  maxScore: Number(dto?.max_score ?? 0),
  tries: Number(dto?.tries ?? 0),
  time: dto?.time != null ? Number(dto.time) : null,
});

const mapCodingProblemDetailDto = (
  dto: any,
): ParticipantCodingProblemDetail => ({
  ...mapCodingProblemRowDto(dto),
  bestSubmission: dto?.best_submission
    ? {
        id: dto.best_submission.id?.toString() || "",
        status: dto.best_submission.status,
        score: Number(dto.best_submission.score ?? 0),
        language: dto.best_submission.language || "",
        createdAt: dto.best_submission.created_at || "",
      }
    : null,
});

const mapCodingTrendPointDto = (dto: any): ParticipantCodingTrendPoint => ({
  submissionId:
    dto?.submission_id != null ? dto.submission_id.toString() : undefined,
  createdAt: dto?.created_at || "",
  minutesFromStart: Number(dto?.minutes_from_start ?? 0),
  score: Number(dto?.score ?? 0),
  solved: dto?.solved != null ? Number(dto.solved) : undefined,
  status: dto?.status,
  language: dto?.language,
  problemId: dto?.problem_id != null ? dto.problem_id.toString() : undefined,
  problemLabel: dto?.problem_label,
  problemTitle: dto?.problem_title,
});

const mapEventFeedItemDto = (dto: EventFeedItemDto): EventFeedItem => ({
  incidentKey: dto?.incident_key || "",
  eventId: dto?.event_id != null ? String(dto.event_id) : "",
  eventType: dto?.event_type || "",
  priority: Number(dto?.priority ?? 3),
  category: dto?.category || "system",
  penalized: !!dto?.penalized,
  firstAt: dto?.first_at || "",
  lastAt: dto?.last_at || "",
  count: Number(dto?.count ?? 1),
  evidenceCount: Number(dto?.evidence_count ?? 0),
  summary: dto?.summary || "",
  source: (dto?.source === "exam_event" ? "exam_event" : "activity") as any,
  userName: dto?.user_name || "",
  userId: dto?.user_id?.toString() || "",
  metadata: dto?.metadata || {},
});

export function mapParticipantDashboardDto(
  dto: ParticipantDashboardDto,
): ParticipantDashboard {
  const participant = mapContestParticipantDto(dto?.participant || {});
  const baseParticipant = {
    ...participant,
    startedAt: dto?.participant?.started_at,
    leftAt: dto?.participant?.left_at,
    lockedAt: dto?.participant?.locked_at,
  };

  const contestType = (
    dto?.contest_type === "paper_exam" ? "paper_exam" : "coding"
  ) as ContestType;
  const report =
    contestType === "paper_exam"
      ? {
          overviewRows: Array.isArray(dto?.report?.overview_rows)
            ? dto.report.overview_rows.map(mapPaperOverviewRowDto)
            : [],
          questionDetails: Array.isArray(dto?.report?.question_details)
            ? dto.report.question_details.map(mapPaperQuestionDetailDto)
            : [],
        }
      : {
          problemGrid: Array.isArray(dto?.report?.problem_grid)
            ? dto.report.problem_grid.map(mapCodingProblemRowDto)
            : [],
          problemDetails: Array.isArray(dto?.report?.problem_details)
            ? dto.report.problem_details.map(mapCodingProblemDetailDto)
            : [],
          trend: {
            submissionTimeline: Array.isArray(
              dto?.report?.trend?.submission_timeline,
            )
              ? dto.report.trend.submission_timeline.map(mapCodingTrendPointDto)
              : [],
            cumulativeProgress: Array.isArray(
              dto?.report?.trend?.cumulative_progress,
            )
              ? dto.report.trend.cumulative_progress.map(mapCodingTrendPointDto)
              : [],
            statusCounts: dto?.report?.trend?.status_counts || {},
          },
        };

  return {
    contestType,
    participant: baseParticipant,
    overview: mapParticipantOverviewDto(dto?.overview || {}),
    report,
    timeline: Array.isArray(dto?.timeline)
      ? dto.timeline.map(mapParticipantTimelineDto)
      : [],
    eventFeed: Array.isArray(dto?.event_feed)
      ? dto.event_feed.map(mapEventFeedItemDto)
      : [],
    actions: {
      canDownloadReport: !!dto?.actions?.can_download_report,
      canEditStatus: !!dto?.actions?.can_edit_status,
      canRemoveParticipant: !!dto?.actions?.can_remove_participant,
      canUnlock: !!dto?.actions?.can_unlock,
      canReopenExam: !!dto?.actions?.can_reopen_exam,
      canViewEvidence: !!dto?.actions?.can_view_evidence,
      canOpenGrading: !!dto?.actions?.can_open_grading,
    },
  };
}
