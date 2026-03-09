import type {
  Contest,
  ContestDetail,
  ContestProblemSummary,
  ScoreboardData,
  ScoreboardRow,
  ExamEvent,
  ExamEventStats,
  ExamQuestion,
  ContestParticipant,
  ParticipantCodingProblemDetail,
  ParticipantCodingProblemRow,
  ParticipantCodingTrendPoint,
  ParticipantDashboard,
  ParticipantDashboardStatus,
  ParticipantDashboardTimelineItem,
  ParticipantEvidenceRow,
  ParticipantOverviewSummary,
  ParticipantPaperQuestionDetail,
  ParticipantPaperReportOverviewRow,
  Clarification,
  ContestAnnouncement,
} from "@/core/entities/contest.entity";

export function mapContestProblemSummaryDto(dto: any): ContestProblemSummary {
  return {
    id: dto.id?.toString() || "",
    problemId: dto.problem_id?.toString() || "",
    label: dto.label || "",
    title: dto.title || "",
    order: dto.order,
    score: dto.score,
    userStatus: dto.user_status,
    difficulty: dto.difficulty,
  };
}

export function mapContestDto(dto: any): Contest {
  return {
    id: dto.id?.toString() || "",
    name: dto.name || "",
    description: dto.description || "",
    startTime: dto.start_time || "",
    endTime: dto.end_time || "",
    status: dto.status || "draft",
    visibility: dto.visibility || "public",
    password: dto.password,

    hasJoined: !!dto.has_joined,
    isRegistered: !!dto.is_registered,
    currentUserRole: dto.current_user_role,
    participantCount: dto.participant_count,
  };
}

export function mapContestDetailDto(dto: any): ContestDetail {
  const contest = mapContestDto(dto);

  return {
    ...contest,
    rules: dto.rules || dto.rule, // Handle alias
    ownerUsername: dto.owner_username || "",

    contestType: dto.contest_type ?? "coding",
    cheatDetectionEnabled: !!dto.cheat_detection_enabled,
    scoreboardVisibleDuringContest: !!dto.scoreboard_visible_during_contest,
    anonymousModeEnabled: !!dto.anonymous_mode_enabled,

    allowMultipleJoins: !!dto.allow_multiple_joins,
    maxCheatWarnings: dto.max_cheat_warnings || 0,
    allowAutoUnlock: !!dto.allow_auto_unlock,
    autoUnlockMinutes: dto.auto_unlock_minutes || 0,
    resultsPublished: !!dto.results_published,
    isExamQuestionsFrozen: !!dto.is_exam_questions_frozen,
    examQuestionsCount: dto.exam_questions_count ?? 0,
    myNickname: dto.my_nickname,

    hasStarted: !!dto.has_started,
    startedAt: dto.started_at,
    leftAt: dto.left_at,
    lockedAt: dto.locked_at,
    lockReason: dto.lock_reason,
    submitReason: dto.submit_reason,
    examStatus: dto.exam_status,
    autoUnlockAt: dto.auto_unlock_at,

    // SSoT computed flags
    isExamMonitored: !!dto.is_exam_monitored,
    requiresFullscreen: !!dto.requires_fullscreen,
    canSubmitExam: !!dto.can_submit_exam,

    permissions: {
      canSwitchView: !!dto.permissions?.can_switch_view,
      canEditContest: !!dto.permissions?.can_edit_contest,
      canToggleStatus: !!dto.permissions?.can_toggle_status,
      canDeleteContest: !!dto.permissions?.can_delete_contest,
      canPublishProblems: !!dto.permissions?.can_publish_problems,
      canViewAllSubmissions: !!dto.permissions?.can_view_all_submissions,
      canViewFullScoreboard: !!dto.permissions?.can_view_full_scoreboard,
      canManageClarifications: !!dto.permissions?.can_manage_clarifications,
    },

    problems: Array.isArray(dto.problems)
      ? dto.problems.map(mapContestProblemSummaryDto)
      : [],

    // Multi-admin support
    admins: Array.isArray(dto.admins)
      ? dto.admins.map((a: any) => ({
          id: a.id?.toString() || "",
          username: a.username || "",
        }))
      : [],
  };
}

export function mapContestParticipantDto(dto: any): ContestParticipant {
  return {
    userId: dto.user_id?.toString() || "",
    username: dto.username || "",
    email: dto.user?.email,
    // 優先使用動態計算的 total_score，否則使用靜態的 score
    score: dto.total_score ?? dto.score ?? 0,
    rank: dto.rank,
    joinedAt: dto.joined_at || "",
    examStatus: dto.exam_status || "not_started",
    lockReason: dto.lock_reason,
    violationCount: dto.violation_count || 0,
    submitReason: dto.submit_reason,
    nickname: dto.nickname,
    displayName: dto.display_name,
  };
}

const mapParticipantDashboardStatusDto = (dto: any): ParticipantDashboardStatus => ({
  code: dto?.code || "",
  label: dto?.label || "",
  color: dto?.color || "gray",
});

const mapParticipantTimelineDto = (dto: any): ParticipantDashboardTimelineItem => ({
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
  totalProblems: dto?.total_problems != null ? Number(dto.total_problems) : undefined,
  rank: dto?.rank != null ? Number(dto.rank) : null,
  totalParticipants:
    dto?.total_participants != null ? Number(dto.total_participants) : undefined,
  effectiveSubmissions:
    dto?.effective_submissions != null ? Number(dto.effective_submissions) : undefined,
  acceptedSubmissions:
    dto?.accepted_submissions != null ? Number(dto.accepted_submissions) : undefined,
  acceptedRate: dto?.accepted_rate != null ? Number(dto.accepted_rate) : undefined,
  correctRate: dto?.correct_rate != null ? Number(dto.correct_rate) : undefined,
  gradedCount: dto?.graded_count != null ? Number(dto.graded_count) : undefined,
  totalQuestions: dto?.total_questions != null ? Number(dto.total_questions) : undefined,
});

const mapPaperOverviewRowDto = (dto: any): ParticipantPaperReportOverviewRow => ({
  questionId: dto?.question_id?.toString() || "",
  index: Number(dto?.index ?? 0),
  questionType: dto?.question_type || "essay",
  status: mapParticipantDashboardStatusDto(dto?.status),
  score: dto?.score != null ? Number(dto.score) : null,
  maxScore: Number(dto?.max_score ?? 0),
});

const mapPaperQuestionDetailDto = (dto: any): ParticipantPaperQuestionDetail => ({
  questionId: dto?.question_id?.toString() || "",
  index: Number(dto?.index ?? 0),
  questionType: dto?.question_type || "essay",
  prompt: dto?.prompt || "",
  options: Array.isArray(dto?.options) ? dto.options.map((item: unknown) => String(item)) : [],
  correctAnswer: dto?.correct_answer,
  answer: dto?.answer || {},
  score: dto?.score != null ? Number(dto.score) : null,
  maxScore: Number(dto?.max_score ?? 0),
  feedback: dto?.feedback || "",
  gradedByUsername: dto?.graded_by_username || null,
  gradedAt: dto?.graded_at || null,
  isCorrect: dto?.is_correct ?? null,
  status: mapParticipantDashboardStatusDto(dto?.status),
});

const mapCodingProblemRowDto = (dto: any): ParticipantCodingProblemRow => ({
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

const mapCodingProblemDetailDto = (dto: any): ParticipantCodingProblemDetail => ({
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
  submissionId: dto?.submission_id != null ? dto.submission_id.toString() : undefined,
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

const mapParticipantEvidenceRowDto = (dto: any): ParticipantEvidenceRow => ({
  id: Number(dto?.id ?? 0),
  uploadSessionId: dto?.upload_session_id || "default",
  hasVideo: !!dto?.has_video,
  jobStatus: dto?.job_status || "pending",
  jobErrorMessage: dto?.job_error_message || "",
  durationSeconds: Number(dto?.duration_seconds ?? 0),
  frameCount: Number(dto?.frame_count ?? 0),
  sizeBytes: Number(dto?.size_bytes ?? 0),
  isSuspected: !!dto?.is_suspected,
  suspectedNote: dto?.suspected_note || "",
  suspectedByUsername: dto?.suspected_by_username || null,
  updatedAt: dto?.updated_at || "",
  createdAt: dto?.created_at || "",
  videoId: dto?.video_id != null ? Number(dto.video_id) : null,
});

export function mapParticipantDashboardDto(dto: any): ParticipantDashboard {
  const participant = mapContestParticipantDto(dto?.participant || {});
  const baseParticipant = {
    ...participant,
    startedAt: dto?.participant?.started_at,
    leftAt: dto?.participant?.left_at,
    lockedAt: dto?.participant?.locked_at,
  };

  const contestType = dto?.contest_type === "paper_exam" ? "paper_exam" : "coding";
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
            submissionTimeline: Array.isArray(dto?.report?.trend?.submission_timeline)
              ? dto.report.trend.submission_timeline.map(mapCodingTrendPointDto)
              : [],
            cumulativeProgress: Array.isArray(dto?.report?.trend?.cumulative_progress)
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
    timeline: Array.isArray(dto?.timeline) ? dto.timeline.map(mapParticipantTimelineDto) : [],
    actions: {
      canDownloadReport: !!dto?.actions?.can_download_report,
      canEditStatus: !!dto?.actions?.can_edit_status,
      canRemoveParticipant: !!dto?.actions?.can_remove_participant,
      canUnlock: !!dto?.actions?.can_unlock,
      canReopenExam: !!dto?.actions?.can_reopen_exam,
      canApproveTakeover: !!dto?.actions?.can_approve_takeover,
      canViewEvidence: !!dto?.actions?.can_view_evidence,
      canOpenGrading: !!dto?.actions?.can_open_grading,
    },
    evidence: Array.isArray(dto?.evidence)
      ? dto.evidence.map(mapParticipantEvidenceRowDto)
      : undefined,
  };
}

export function mapScoreboardRowDto(dto: any): ScoreboardRow {
  return {
    userId: dto.user_id?.toString() || "",
    displayName: dto.display_name || "",
    solvedCount: dto.solved_count || 0,
    totalScore: dto.total_score || 0,
    penalty: dto.penalty || 0,
    rank: dto.rank || 0,
    problems: dto.problems || {},
  };
}

export function mapScoreboardDto(dto: any): ScoreboardData {
  // API returns { problems: [], standings: [] }
  const standings = dto.standings || dto.rows || [];

  return {
    contestId: dto.contest?.id?.toString() || "",
    contestName: dto.contest?.name || "",
    problems: Array.isArray(dto.problems)
      ? dto.problems.map((p: any) => ({
          id: p.id,
          label: p.label,
          problemId: p.id?.toString() || p.problem_id?.toString(),
          title: p.title,
          order: p.order,
          score: p.score,
        }))
      : [],
    rows: Array.isArray(standings)
      ? standings.map((s: any) => ({
          rank: s.rank || 0,
          user: s.user || { id: 0, username: "Unknown" },
          userId: s.user?.id?.toString() || "",
          displayName: s.display_name || s.nickname || s.user?.username || "",
          nickname: s.nickname,
          display_name: s.display_name, // Pass original for compatibility if needed
          solved: s.solved || 0,
          solvedCount: s.solved || 0,
          totalScore: s.total_score || 0,
          total_score: s.total_score || 0,
          time: s.time || 0,
          penalty: s.time || 0,
          problems: s.problems || {},
        }))
      : [],
  };
}

export function mapExamEventDto(dto: any): ExamEvent {
  const meta: Record<string, unknown> | undefined =
    dto.metadata
      ? typeof dto.metadata === "string"
        ? (() => { try { return JSON.parse(dto.metadata); } catch { return { raw: dto.metadata }; } })()
        : dto.metadata
      : undefined;

  return {
    id: dto.id?.toString() || "",
    userId: (dto.user_id || dto.user)?.toString() || "",
    userName: dto.user_username || dto.user?.username || "Unknown",
    eventType: dto.event_type,
    timestamp: dto.created_at || "",
    reason: typeof meta?.reason === "string" ? meta.reason : undefined,
    metadata: meta,
  };
}

export function mapClarificationDto(dto: any): Clarification {
  return {
    id: dto.id?.toString() || "",
    question: dto.question || "",
    answer: dto.answer,
    problemId: dto.problem_id?.toString(),
    problemTitle: dto.problem_title,
    isPublic: !!dto.is_public,
    authorUsername:
      dto.author_username || dto.created_by?.username || "Unknown",
    answeredBy: dto.answered_by,
    createdAt: dto.created_at || "",
    updatedAt: dto.updated_at || "",
  };
}

export function mapContestAnnouncementDto(dto: any): ContestAnnouncement {
  return {
    id: dto.id?.toString() || "",
    title: dto.title || "",
    content: dto.content || "",
    createdBy: dto.created_by?.username || "Admin",
    createdAt: dto.created_at || "",
    updatedAt: dto.updated_at || "",
  };
}

export function mapExamEventStatsDto(dto: any): ExamEventStats {
  return {
    userId: dto.user_id?.toString() || "",
    userName: dto.user_name || "",
    tabHiddenCount: dto.tab_hidden_count || 0,
    windowBlurCount: dto.window_blur_count || 0,
    exitFullscreenCount: dto.exit_fullscreen_count || 0,
    forbiddenFocusEventCount: dto.forbidden_focus_event_count || 0,
    totalViolations: dto.total_violations || 0,
  };
}

export function mapExamQuestionDto(dto: any): ExamQuestion {
  return {
    id: dto.id?.toString() || "",
    contestId: dto.contest?.toString() || "",
    questionType: dto.question_type || "essay",
    prompt: dto.prompt || "",
    options: Array.isArray(dto.options)
      ? dto.options.map((item: unknown) => String(item))
      : [],
    correctAnswer: dto.correct_answer,
    score: Number(dto.score || 0),
    order: Number(dto.order || 0),
    createdAt: dto.created_at || "",
    updatedAt: dto.updated_at || "",
  };
}

export function mapContestUpdateRequestToDto(request: any): any {
  const dto: any = {
    name: request.name,
    description: request.description,
    rules: request.rules,
    start_time: request.startTime,
    end_time: request.endTime,
    status: request.status,
    visibility: request.visibility,
    password: request.password,
    cheat_detection_enabled: request.cheatDetectionEnabled,
    scoreboard_visible_during_contest: request.scoreboardVisibleDuringContest,
    anonymous_mode_enabled: request.anonymousModeEnabled,
    allow_multiple_joins: request.allowMultipleJoins,
    max_cheat_warnings: request.maxCheatWarnings,
    allow_auto_unlock: request.allowAutoUnlock,
    auto_unlock_minutes: request.autoUnlockMinutes,
    results_published: request.resultsPublished,
  };
  // Strip undefined keys so PATCH only sends changed fields
  Object.keys(dto).forEach((k) => {
    if (dto[k] === undefined) delete dto[k];
  });
  return dto;
}
