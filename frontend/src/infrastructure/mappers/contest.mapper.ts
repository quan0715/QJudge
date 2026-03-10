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
  EventFeedItem,
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
  ContestAnticheatConfig,
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

export function mapContestAnticheatConfigDto(dto: any): ContestAnticheatConfig {
  const ensureObject = (value: unknown, path: string): Record<string, unknown> => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`Invalid anti-cheat config payload: ${path} must be an object`);
    }
    return value as Record<string, unknown>;
  };

  const ensureNumber = (obj: Record<string, unknown>, key: string, path: string): number => {
    const value = obj[key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`Invalid anti-cheat config payload: ${path}.${key} must be a number`);
    }
    return value;
  };

  const ensureBoolean = (obj: Record<string, unknown>, key: string, path: string): boolean => {
    const value = obj[key];
    if (typeof value !== "boolean") {
      throw new Error(`Invalid anti-cheat config payload: ${path}.${key} must be a boolean`);
    }
    return value;
  };

  const ensureString = (obj: Record<string, unknown>, key: string, path: string): string => {
    const value = obj[key];
    if (typeof value !== "string") {
      throw new Error(`Invalid anti-cheat config payload: ${path}.${key} must be a string`);
    }
    return value;
  };

  const ensureStringArray = (obj: Record<string, unknown>, key: string, path: string): string[] => {
    const value = obj[key];
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
      throw new Error(`Invalid anti-cheat config payload: ${path}.${key} must be string[]`);
    }
    return value;
  };

  const mapSetting = (item: unknown) => {
    const parsed = ensureObject(item, "frontend_controlled_settings item");
    return {
      key: ensureString(parsed, "key", "frontend_controlled_settings item"),
      description: ensureString(parsed, "description", "frontend_controlled_settings item"),
    };
  };

  const root = ensureObject(dto, "root");
  const globalDefaults = ensureObject(root["global_defaults"], "global_defaults");
  const contestSettings = ensureObject(root["contest_settings"], "contest_settings");
  const effective = ensureObject(root["effective"], "effective");
  const frontendControlledSettings = ensureObject(
    root["frontend_controlled_settings"],
    "frontend_controlled_settings"
  );

  const rawGlobalSettings = frontendControlledSettings["global"];
  const rawContestSettings = frontendControlledSettings["contest"];
  if (!Array.isArray(rawGlobalSettings) || !Array.isArray(rawContestSettings)) {
    throw new Error(
      "Invalid anti-cheat config payload: frontend_controlled_settings.global/contest must be arrays"
    );
  }

  const version = root["version"];
  if (typeof version !== "number" || !Number.isFinite(version)) {
    throw new Error("Invalid anti-cheat config payload: version must be a number");
  }

  return {
    version,
    globalDefaults: {
      captureIntervalSeconds: ensureNumber(globalDefaults, "capture_interval_seconds", "global_defaults"),
      captureUploadMaxRetries: ensureNumber(globalDefaults, "capture_upload_max_retries", "global_defaults"),
      warningTimeoutSeconds: ensureNumber(globalDefaults, "warning_timeout_seconds", "global_defaults"),
      forcedCaptureCooldownMs: ensureNumber(globalDefaults, "forced_capture_cooldown_ms", "global_defaults"),
      forcedCaptureP1CooldownMs: ensureNumber(globalDefaults, "forced_capture_p1_cooldown_ms", "global_defaults"),
      eventFeedAggregationWindowSeconds: ensureNumber(
        globalDefaults,
        "event_feed_aggregation_window_seconds",
        "global_defaults"
      ),
      incidentScreenshotWindowBeforeMs: ensureNumber(
        globalDefaults,
        "incident_screenshot_window_before_ms",
        "global_defaults"
      ),
      incidentScreenshotWindowAfterMs: ensureNumber(
        globalDefaults,
        "incident_screenshot_window_after_ms",
        "global_defaults"
      ),
      incidentScreenshotPreviewLimit: ensureNumber(
        globalDefaults,
        "incident_screenshot_preview_limit",
        "global_defaults"
      ),
      incidentScreenshotCategories: ensureStringArray(
        globalDefaults,
        "incident_screenshot_categories",
        "global_defaults"
      ),
      monitoringRecoveryGraceMs: ensureNumber(globalDefaults, "monitoring_recovery_grace_ms", "global_defaults"),
      mouseLeaveCooldownMs: ensureNumber(globalDefaults, "mouse_leave_cooldown_ms", "global_defaults"),
      screenShareRecoveryGraceMs: ensureNumber(
        globalDefaults,
        "screen_share_recovery_grace_ms",
        "global_defaults"
      ),
      multiDisplayCheckIntervalMs: ensureNumber(
        globalDefaults,
        "multi_display_check_interval_ms",
        "global_defaults"
      ),
      multiDisplayReportCooldownMs: ensureNumber(
        globalDefaults,
        "multi_display_report_cooldown_ms",
        "global_defaults"
      ),
      presignedUrlTtlSeconds: ensureNumber(globalDefaults, "presigned_url_ttl_seconds", "global_defaults"),
    },
    contestSettings: {
      cheatDetectionEnabled: ensureBoolean(contestSettings, "cheat_detection_enabled", "contest_settings"),
      allowMultipleJoins: ensureBoolean(contestSettings, "allow_multiple_joins", "contest_settings"),
      maxCheatWarnings: ensureNumber(contestSettings, "max_cheat_warnings", "contest_settings"),
      allowAutoUnlock: ensureBoolean(contestSettings, "allow_auto_unlock", "contest_settings"),
      autoUnlockMinutes: ensureNumber(contestSettings, "auto_unlock_minutes", "contest_settings"),
      contestType:
        ensureString(contestSettings, "contest_type", "contest_settings") === "paper_exam"
          ? "paper_exam"
          : "coding",
    },
    effective: {
      captureIntervalSeconds: ensureNumber(effective, "capture_interval_seconds", "effective"),
      captureUploadMaxRetries: ensureNumber(effective, "capture_upload_max_retries", "effective"),
      warningTimeoutSeconds: ensureNumber(effective, "warning_timeout_seconds", "effective"),
      forcedCaptureCooldownMs: ensureNumber(effective, "forced_capture_cooldown_ms", "effective"),
      forcedCaptureP1CooldownMs: ensureNumber(effective, "forced_capture_p1_cooldown_ms", "effective"),
      eventFeedAggregationWindowSeconds: ensureNumber(
        effective,
        "event_feed_aggregation_window_seconds",
        "effective"
      ),
      incidentScreenshotWindowBeforeMs: ensureNumber(
        effective,
        "incident_screenshot_window_before_ms",
        "effective"
      ),
      incidentScreenshotWindowAfterMs: ensureNumber(
        effective,
        "incident_screenshot_window_after_ms",
        "effective"
      ),
      incidentScreenshotPreviewLimit: ensureNumber(
        effective,
        "incident_screenshot_preview_limit",
        "effective"
      ),
      incidentScreenshotCategories: ensureStringArray(
        effective,
        "incident_screenshot_categories",
        "effective"
      ),
      monitoringRecoveryGraceMs: ensureNumber(effective, "monitoring_recovery_grace_ms", "effective"),
      mouseLeaveCooldownMs: ensureNumber(effective, "mouse_leave_cooldown_ms", "effective"),
      screenShareRecoveryGraceMs: ensureNumber(
        effective,
        "screen_share_recovery_grace_ms",
        "effective"
      ),
      multiDisplayCheckIntervalMs: ensureNumber(
        effective,
        "multi_display_check_interval_ms",
        "effective"
      ),
      multiDisplayReportCooldownMs: ensureNumber(
        effective,
        "multi_display_report_cooldown_ms",
        "effective"
      ),
      presignedUrlTtlSeconds: ensureNumber(effective, "presigned_url_ttl_seconds", "effective"),
      cheatDetectionEnabled: ensureBoolean(effective, "cheat_detection_enabled", "effective"),
      allowMultipleJoins: ensureBoolean(effective, "allow_multiple_joins", "effective"),
      maxCheatWarnings: ensureNumber(effective, "max_cheat_warnings", "effective"),
      allowAutoUnlock: ensureBoolean(effective, "allow_auto_unlock", "effective"),
      autoUnlockMinutes: ensureNumber(effective, "auto_unlock_minutes", "effective"),
      contestType: ensureString(effective, "contest_type", "effective") === "paper_exam" ? "paper_exam" : "coding",
    },
    frontendControlledSettings: {
      global: rawGlobalSettings.map(mapSetting),
      contest: rawContestSettings.map(mapSetting),
    },
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

const mapEventFeedItemDto = (dto: any): EventFeedItem => ({
  incidentKey: dto?.incident_key || "",
  eventType: dto?.event_type || "",
  priority: Number(dto?.priority ?? 3),
  category: dto?.category || "system",
  penalized: !!dto?.penalized,
  firstAt: dto?.first_at || "",
  lastAt: dto?.last_at || "",
  count: Number(dto?.count ?? 1),
  evidenceCount: Number(dto?.evidence_count ?? 0),
  summary: dto?.summary || "",
  source: dto?.source === "exam_event" ? "exam_event" : "activity",
  userName: dto?.user_name || "",
  userId: dto?.user_id?.toString() || "",
  metadata: dto?.metadata || {},
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
    eventFeed: Array.isArray(dto?.event_feed) ? dto.event_feed.map(mapEventFeedItemDto) : [],
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
