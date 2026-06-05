import {
  type Contest,
  type ContestDetail,
  type ContestProblemSummary,
  type ScoreboardData,
  type ExamEvent,
  type ExamPaper,
  type ExamPaperBlock,
  type ExamPaperSection,
  type ExamQuestion,
  type ExamQuestionAnswerFormat,
  type ExamQuestionGroup,
  type ExamQuestionType,
  type Clarification,
  type ContestAnnouncement,
  type ContestOverviewMetrics,
  type ContestUpdateRequest,
} from "@/core/entities/contest.entity";
import type {
  ContestProblemSummaryDto,
  ContestDto,
  ContestDetailDto,
  ContestOverviewMetricsDto,
  ExamPaperBlockDto,
  ExamPaperDto,
  ExamQuestionGroupDto,
  ExamQuestionDto,
  ScoreboardDto,
} from "@/infrastructure/api/dto/contest.dto";
import {
  FIXED_SCREEN_SHARE_RECOVERY_GRACE_MS,
  mapAnticheatDevicePolicyDto,
} from "./contest.anticheat.mapper";

export { mapContestAnticheatConfigDto } from "./contest.anticheat.mapper";
export {
  mapContestParticipantDto,
  mapParticipantDashboardDto,
} from "./contest.participant.mapper";

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

const ANSWER_FORMATS = new Set<ExamQuestionAnswerFormat>([
  "plain_text",
  "markdown",
  "markdown_math",
  "open_document",
]);

function mapAnswerFormat(value?: string): ExamQuestionAnswerFormat {
  return value && ANSWER_FORMATS.has(value as ExamQuestionAnswerFormat)
    ? (value as ExamQuestionAnswerFormat)
    : "plain_text";
}

export function mapExamQuestionGroupDto(
  dto: ExamQuestionGroupDto,
): ExamQuestionGroup {
  return {
    id: dto.id?.toString() || "",
    contestId: dto.contest?.toString() || "",
    title: dto.title || "",
    sharedStemMarkdown: dto.shared_stem_markdown || "",
    order: Number(dto.order || 0),
    totalScore: Number(dto.total_score || 0),
    createdAt: dto.created_at || "",
    updatedAt: dto.updated_at || "",
  };
}

export function mapExamQuestionDto(dto: ExamQuestionDto): ExamQuestion {
  return {
    id: dto.id?.toString() || "",
    contestId: dto.contest?.toString() || "",
    questionType: (dto.question_type || "essay") as ExamQuestionType,
    prompt: dto.prompt || "",
    options: Array.isArray(dto.options)
      ? dto.options.map((item: unknown) => String(item))
      : [],
    correctAnswer: dto.correct_answer,
    referenceAnswerDocument: dto.reference_answer_document ?? null,
    explanation: dto.explanation || "",
    explanationDocument: dto.explanation_document ?? null,
    score: Number(dto.score || 0),
    effectiveMaxScore: dto.effective_max_score != null
      ? Number(dto.effective_max_score)
      : undefined,
    scorePolicy: dto.score_policy || "normal",
    scorePolicyConfig: dto.score_policy_config
      ? { redistributeTo: dto.score_policy_config.redistribute_to ?? [] }
      : undefined,
    order: Number(dto.order || 0),
    groupId: dto.group_id != null ? dto.group_id.toString() : null,
    orderInGroup:
      typeof dto.order_in_group === "number" ? dto.order_in_group : null,
    answerFormat: mapAnswerFormat(dto.answer_format),
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

export function buildExamPaperSections(
  questions: ExamQuestion[],
  groups: ExamQuestionGroup[],
): ExamPaperSection[] {
  const groupsById = new Map(groups.map((group) => [group.id, group]));
  const sortedQuestions = [...questions].sort((a, b) => a.order - b.order);
  const sections: ExamPaperSection[] = [];

  for (const question of sortedQuestions) {
    const group = question.groupId ? groupsById.get(question.groupId) : null;
    if (!group) {
      sections.push({ kind: "flat", item: question });
      continue;
    }

    const previous = sections[sections.length - 1];
    if (previous?.kind === "group" && previous.group.id === group.id) {
      previous.items.push(question);
    } else {
      sections.push({ kind: "group", group, items: [question] });
    }
  }

  return sections;
}

export function buildExamPaperBlocks(
  questions: ExamQuestion[],
  groups: ExamQuestionGroup[],
): ExamPaperBlock[] {
  return buildExamPaperSections(questions, groups).map((section) => {
    if (section.kind === "flat") {
      return {
        kind: "question",
        id: section.item.id,
        question: section.item,
      };
    }
    return {
      kind: "group",
      id: section.group.id,
      group: section.group,
      children: section.items,
    };
  });
}

export function mapExamPaperBlockDto(dto: ExamPaperBlockDto): ExamPaperBlock | null {
  if (dto.kind === "question") {
    const question = dto.question ? mapExamQuestionDto(dto.question) : null;
    if (!question) return null;
    return {
      kind: "question",
      id: dto.id?.toString() || question.id,
      question,
    };
  }

  if (dto.kind === "group") {
    const group = dto.group ? mapExamQuestionGroupDto(dto.group) : null;
    if (!group) return null;
    return {
      kind: "group",
      id: dto.id?.toString() || group.id,
      group,
      children: Array.isArray(dto.children)
        ? dto.children.map(mapExamQuestionDto)
        : [],
    };
  }

  return null;
}

export function mapExamPaperDto(dto: ExamPaperDto): ExamPaper {
  const groups = Array.isArray(dto.groups)
    ? dto.groups.map(mapExamQuestionGroupDto)
    : [];
  const questions = Array.isArray(dto.questions)
    ? dto.questions.map(mapExamQuestionDto)
    : [];
  const sections = buildExamPaperSections(questions, groups);
  const blocks = Array.isArray(dto.blocks)
    ? dto.blocks
        .map(mapExamPaperBlockDto)
        .filter((block): block is ExamPaperBlock => block !== null)
    : buildExamPaperBlocks(questions, groups);

  return {
    questions,
    groups,
    sections,
    blocks,
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
