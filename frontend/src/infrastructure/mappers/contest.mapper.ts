import {
  type Contest,
  type ContestDetail,
  type ContestProblemSummary,
  type ScoreboardData,
  type ExamEvent,
  type ExamQuestion,
  type ContestParticipant,
  type EventFeedItem,
  type ParticipantCodingProblemDetail,
  type ParticipantCodingProblemRow,
  type ParticipantCodingTrendPoint,
  type ParticipantDashboard,
  type ParticipantDashboardStatus,
  type ParticipantDashboardTimelineItem,
  type ParticipantOverviewSummary,
  type ParticipantPaperQuestionDetail,
  type ParticipantPaperReportOverviewRow,
  type Clarification,
  type ContestAnnouncement,
  type ContestOverviewMetrics,
  type ContestUpdateRequest,
  type ContestType,
  type ExamQuestionType,
} from "@/core/entities/contest.entity";
import type {
  ContestProblemSummaryDto,
  ContestDto,
  ContestDetailDto,
  ContestOverviewMetricsDto,
  ContestParticipantDto,
  ParticipantDashboardDto,
  ScoreboardDto,
  ParticipantDashboardStatusDto,
  ParticipantTimelineItemDto,
  ParticipantPaperReportRowDto,
  ParticipantCodingProblemRowDto,
  EventFeedItemDto,
} from "@/infrastructure/api/dto/contest.dto";
import {
  FIXED_SCREEN_SHARE_RECOVERY_GRACE_MS,
  mapAnticheatDevicePolicyDto,
} from "./contest.anticheat.mapper";

export { mapContestAnticheatConfigDto } from "./contest.anticheat.mapper";

function mapContestProblemSummaryDto(
  dto: ContestProblemSummaryDto,
): ContestProblemSummary {
  const resolvedMaxScore = dto.max_score ?? dto.score;
  return {
    id: dto.id?.toString() || "",
    problemId: dto.problem_id?.toString() || "",
    label: dto.label || "",
    title: dto.title || "",
    order: dto.order,
    score: resolvedMaxScore,
    maxScore: resolvedMaxScore,
    sourceBank: dto.source_bank
      ? {
          id: dto.source_bank.id?.toString() || "",
          name: dto.source_bank.name || "",
        }
      : null,
    sourceQuestionId:
      dto.source_question_id != null ? dto.source_question_id.toString() : null,
    sourceMode: dto.source_mode || "manual",
    userStatus: dto.user_status,
    difficulty: dto.difficulty as any,
  };
}

export function mapContestDto(dto: ContestDto): Contest {
  return {
    id: dto.id?.toString() || "",
    name: dto.name || "",
    description: dto.description || "",
    startTime: dto.start_time || "",
    endTime: dto.end_time || "",
    status: dto.status || "draft",
    visibility: dto.visibility || "public",
    attendanceCheckEnabled: !!dto.attendance_check_enabled,
    attendancePhotoPolicy: dto.attendance_photo_policy || "room",
    deliveryMode: dto.delivery_mode || "exam",
    countsTowardGrade: dto.counts_toward_grade ?? true,

    hasJoined: !!dto.has_joined,
    isRegistered: !!dto.is_registered,
    currentUserRole: dto.current_user_role,
    participantCount: dto.participant_count,
  };
}

export function mapContestDetailDto(dto: ContestDetailDto): ContestDetail {
  const contest = mapContestDto(dto);

  return {
    ...contest,
    rules: dto.rules || dto.rule, // Handle alias
    ownerUsername: dto.owner_username || "",
    isClassroomBound: !!dto.is_classroom_bound,
    boundClassroomId: dto.bound_classroom_id?.toString?.() ?? null,

    contestType: dto.contest_type ?? "coding",
    deliveryMode: dto.delivery_mode ?? "exam",
    countsTowardGrade: dto.counts_toward_grade ?? true,
    cheatDetectionEnabled: !!dto.cheat_detection_enabled,
    anticheatDevicePolicy: mapAnticheatDevicePolicyDto(
      dto.anticheat_device_policy,
    ),
    warningTimeoutSeconds:
      typeof dto.warning_timeout_seconds === "number"
        ? dto.warning_timeout_seconds
        : 20,
    screenShareRecoveryGraceMs: FIXED_SCREEN_SHARE_RECOVERY_GRACE_MS,
    scoreboardVisibleDuringContest: !!dto.scoreboard_visible_during_contest,

    allowMultipleJoins: !!dto.allow_multiple_joins,
    maxCheatWarnings: dto.max_cheat_warnings || 0,
    resultsPublished: !!dto.results_published,
    questionEditLocked: !!dto.question_edit_locked,
    questionEditLockedAt: dto.question_edit_locked_at ?? null,
    questionEditLockTrigger: dto.question_edit_lock_trigger ?? null,
    examQuestionsCount: dto.exam_questions_count ?? 0,

    hasStarted: !!dto.has_started,
    startedAt: dto.started_at,
    leftAt: dto.left_at,
    lockedAt: dto.locked_at,
    lockReason: dto.lock_reason,
    submitReason: dto.submit_reason,
    examStatus: dto.exam_status,
    assignmentState: (dto.assignment_state as any) ?? null,
    acceptedAt: dto.accepted_at ?? null,
    submittedAt: dto.submitted_at ?? null,

    // SSoT computed flags
    isExamMonitored: !!dto.is_exam_monitored,
    requiresFullscreen: !!dto.requires_fullscreen,
    canSubmitExam: !!dto.can_submit_exam,
    attendanceStatus: dto.attendance_status
      ? {
          attendanceRequired: !!dto.attendance_status.attendanceRequired,
          photoPolicy: dto.attendance_status.photoPolicy || "room",
          requiredPhotoKinds: Array.isArray(dto.attendance_status.requiredPhotoKinds)
            ? dto.attendance_status.requiredPhotoKinds.filter(
                (kind) => kind === "room" || kind === "selfie",
              )
            : ["room"],
          checkInStatus: (dto.attendance_status.checkInStatus || "not_required") as any,
          checkOutStatus: (dto.attendance_status.checkOutStatus || "unavailable") as any,
          canCheckIn: !!dto.attendance_status.canCheckIn,
          canStartExam: !!dto.attendance_status.canStartExam,
          canCheckOut: !!dto.attendance_status.canCheckOut,
        }
      : undefined,

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
      ? dto.admins.map((a) => ({
          id: a.id?.toString() || "",
          username: a.username || "",
        }))
      : [],
  };
}

export function mapContestOverviewMetricsDto(
  dto: ContestOverviewMetricsDto,
): ContestOverviewMetrics {
  const examStatus =
    dto?.exam?.status === "upcoming" ||
    dto?.exam?.status === "running" ||
    dto?.exam?.status === "ended"
      ? (dto.exam.status as any)
      : "upcoming";

  const contestType =
    dto?.exam?.contest_type === "paper_exam" ? "paper_exam" : "coding";

  return {
    onlineNow: Number(dto?.online_now ?? 0),
    onlineActiveSessions: Number(dto?.online_active_sessions ?? 0),
    exam: {
      status: examStatus,
      contestType,
    },
    timeProgress: {
      totalSeconds: Number(dto?.time_progress?.total_seconds ?? 0),
      elapsedSeconds: Number(dto?.time_progress?.elapsed_seconds ?? 0),
      remainingSeconds: Number(dto?.time_progress?.remaining_seconds ?? 0),
      progressPercent: Number(dto?.time_progress?.progress_percent ?? 0),
      isStarted: !!dto?.time_progress?.is_started,
      isEnded: !!dto?.time_progress?.is_ended,
    },
  };
}

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

export function mapScoreboardDto(dto: ScoreboardDto): ScoreboardData {
  const standings = dto.standings || dto.rows || [];

  return {
    contestId: dto.contest?.id?.toString() || "",
    contestName: dto.contest?.name || "",
    problems: Array.isArray(dto.problems)
      ? dto.problems.map((p: any) => ({
          id: p.id?.toString() || p.problem_id?.toString() || "",
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
          displayName: s.display_name || s.user?.username || "",
          solvedCount: s.solved || s.solved_count || 0,
          totalScore: s.total_score || 0,
          penalty: s.time || 0,
          problems: s.problems || {},
        }))
      : [],
  };
}

export function mapExamEventDto(dto: any): ExamEvent {
  const meta: Record<string, unknown> | undefined = dto.metadata
    ? typeof dto.metadata === "string"
      ? (() => {
          try {
            return JSON.parse(dto.metadata);
          } catch {
            return { raw: dto.metadata };
          }
        })()
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

export function mapContestAnnouncementDto(dto: {
  id?: number | string;
  title?: string;
  content?: string;
  created_by?: { username?: string };
  created_at?: string;
  updated_at?: string;
}): ContestAnnouncement {
  return {
    id: dto.id?.toString() || "",
    title: dto.title || "",
    content: dto.content || "",
    createdBy: dto.created_by?.username || "Admin",
    createdAt: dto.created_at || "",
    updatedAt: dto.updated_at || "",
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
    explanation: dto.explanation || "",
    score: Number(dto.score || 0),
    order: Number(dto.order || 0),
    sourceBank: dto.source_bank
      ? {
          id: dto.source_bank.id?.toString() || "",
          name: dto.source_bank.name || "",
        }
      : null,
    sourceQuestionId:
      dto.source_question_id != null ? dto.source_question_id.toString() : null,
    sourceMode: dto.source_mode || "manual",
    createdAt: dto.created_at || "",
    updatedAt: dto.updated_at || "",
  };
}

export function mapContestUpdateRequestToDto(
  request: ContestUpdateRequest,
): any {
  const anticheatDevicePolicy =
    request.anticheatDevicePolicy != null
      ? {
          desktop: {
            enabled: !!request.anticheatDevicePolicy.desktop?.enabled,
            sources: {
              screen_share: {
                enabled:
                  !!request.anticheatDevicePolicy.desktop?.sources?.screenShare
                    ?.enabled,
                capture_interval_seconds:
                  request.anticheatDevicePolicy.desktop?.sources?.screenShare
                    ?.captureIntervalSeconds ?? 5,
              },
              webcam: {
                enabled:
                  !!request.anticheatDevicePolicy.desktop?.sources?.webcam
                    ?.enabled,
                capture_interval_seconds:
                  request.anticheatDevicePolicy.desktop?.sources?.webcam
                    ?.captureIntervalSeconds ?? 10,
              },
            },
            detectors: {
              pwa_mode:
                !!request.anticheatDevicePolicy.desktop?.detectors?.pwaMode,
              fullscreen:
                !!request.anticheatDevicePolicy.desktop?.detectors?.fullscreen,
              multi_display:
                !!request.anticheatDevicePolicy.desktop?.detectors
                  ?.multiDisplay,
              mouse_leave:
                !!request.anticheatDevicePolicy.desktop?.detectors?.mouseLeave,
              viewport_integrity:
                !!request.anticheatDevicePolicy.desktop?.detectors
                  ?.viewportIntegrity,
            },
          },
          tablet: {
            enabled: !!request.anticheatDevicePolicy.tablet?.enabled,
            sources: {
              screen_share: {
                enabled:
                  !!request.anticheatDevicePolicy.tablet?.sources?.screenShare
                    ?.enabled,
                capture_interval_seconds:
                  request.anticheatDevicePolicy.tablet?.sources?.screenShare
                    ?.captureIntervalSeconds ?? 5,
              },
              webcam: {
                enabled:
                  !!request.anticheatDevicePolicy.tablet?.sources?.webcam
                    ?.enabled,
                capture_interval_seconds:
                  request.anticheatDevicePolicy.tablet?.sources?.webcam
                    ?.captureIntervalSeconds ?? 10,
              },
            },
            detectors: {
              pwa_mode:
                !!request.anticheatDevicePolicy.tablet?.detectors?.pwaMode,
              fullscreen:
                !!request.anticheatDevicePolicy.tablet?.detectors?.fullscreen,
              multi_display:
                !!request.anticheatDevicePolicy.tablet?.detectors?.multiDisplay,
              mouse_leave:
                !!request.anticheatDevicePolicy.tablet?.detectors?.mouseLeave,
              viewport_integrity:
                !!request.anticheatDevicePolicy.tablet?.detectors
                  ?.viewportIntegrity,
            },
          },
        }
      : undefined;

  const dto: any = {
    name: request.name,
    description: request.description,
    rules: request.rules,
    start_time: request.startTime,
    end_time: request.endTime,
    status: request.status,
    visibility: request.visibility,
    attendance_check_enabled: request.attendanceCheckEnabled,
    attendance_photo_policy: request.attendancePhotoPolicy,
    cheat_detection_enabled: request.cheatDetectionEnabled,
    anticheat_device_policy: anticheatDevicePolicy,
    warning_timeout_seconds: request.warningTimeoutSeconds,
    screen_share_recovery_grace_ms:
      request.screenShareRecoveryGraceMs === undefined
        ? undefined
        : FIXED_SCREEN_SHARE_RECOVERY_GRACE_MS,
    scoreboard_visible_during_contest: request.scoreboardVisibleDuringContest,
    allow_multiple_joins: request.allowMultipleJoins,
    max_cheat_warnings: request.maxCheatWarnings,
    results_published: request.resultsPublished,
    counts_toward_grade: request.countsTowardGrade,
  };
  // Strip undefined keys so PATCH only sends changed fields
  Object.keys(dto).forEach((k) => {
    if (dto[k] === undefined) delete dto[k];
  });
  return dto;
}
