import type {
  Contest,
  ContestDetail,
  ContestProblemSummary,
  ScoreboardData,
  ScoreboardRow,
  ExamEvent,
  ExamEventStats,
  ContestQuestion,
  ContestParticipant,
  Clarification,
  ContestAnnouncement,
} from "../contest.entity";

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
    status: dto.status || "inactive",
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

    examModeEnabled: !!dto.exam_mode_enabled,
    scoreboardVisibleDuringContest: !!dto.scoreboard_visible_during_contest,
    anonymousModeEnabled: !!dto.anonymous_mode_enabled,

    allowMultipleJoins: !!dto.allow_multiple_joins,
    maxCheatWarnings: dto.max_cheat_warnings || 0,
    allowAutoUnlock: !!dto.allow_auto_unlock,
    autoUnlockMinutes: dto.auto_unlock_minutes || 0,
    myNickname: dto.my_nickname,

    hasStarted: !!dto.has_started,
    startedAt: dto.started_at,
    leftAt: dto.left_at,
    lockedAt: dto.locked_at,
    lockReason: dto.lock_reason,
    examStatus: dto.exam_status,
    autoUnlockAt: dto.auto_unlock_at,

    permissions: {
      canSwitchView: !!dto.permissions?.can_switch_view,
      canEditContest: !!dto.permissions?.can_edit_contest,
      canToggleStatus: !!dto.permissions?.can_toggle_status,
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
    score: dto.score || 0,
    rank: dto.rank,
    joinedAt: dto.joined_at || "",
    examStatus: dto.exam_status || "not_started",
    lockReason: dto.lock_reason,
    violationCount: dto.violation_count || 0,
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
  return {
    id: dto.id?.toString() || "",
    userId: (dto.user_id || dto.user)?.toString() || "",
    userName: dto.user_username || dto.user?.username || "Unknown",
    eventType: dto.event_type,
    timestamp: dto.created_at || "",
    reason: dto.metadata
      ? typeof dto.metadata === "string"
        ? dto.metadata
        : JSON.stringify(dto.metadata)
      : undefined,
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
    totalViolations: dto.total_violations || 0,
  };
}

export function mapContestQuestionDto(dto: any): ContestQuestion {
  return {
    id: dto.id?.toString() || "",
    title: dto.title || "",
    content: dto.content || "",
    answer: dto.answer,
    isPublic: !!dto.is_public,
    authorUsername: dto.student_name || dto.author_username,
    answeredBy: dto.answered_by,
    createdAt: dto.created_at || "",
    updatedAt: dto.updated_at || "",
  };
}

export function mapContestUpdateRequestToDto(request: any): any {
  return {
    name: request.name,
    description: request.description,
    rules: request.rules,
    start_time: request.startTime,
    end_time: request.endTime,
    status: request.status,
    visibility: request.visibility,
    password: request.password,
    exam_mode_enabled: request.examModeEnabled,
    scoreboard_visible_during_contest: request.scoreboardVisibleDuringContest,
    anonymous_mode_enabled: request.anonymousModeEnabled,
    allow_multiple_joins: request.allowMultipleJoins,
    max_cheat_warnings: request.maxCheatWarnings,
    allow_auto_unlock: request.allowAutoUnlock,
    auto_unlock_minutes: request.autoUnlockMinutes,
  };
}
