import type {
  ContestParticipant,
  ExamStatusType,
  ParticipantDashboardDetail,
} from "@/core/entities/contest.entity";

export const EXAM_STATUS_KEYS: ExamStatusType[] = [
  "not_started",
  "in_progress",
  "paused",
  "locked",
  "locked_takeover",
  "submitted",
];

export const DETAIL_OPTIONS_BY_TYPE: Record<
  "coding" | "paper_exam",
  ParticipantDashboardDetail[]
> = {
  coding: ["overview", "report", "events", "submissions"],
  paper_exam: ["overview", "report", "events", "evidence"],
};

export type SortKey = "score_desc" | "joined_desc" | "violations_desc" | "name_asc";

export const STATUS_TAG_TYPE: Record<string, string> = {
  submitted: "green",
  in_progress: "blue",
  paused: "purple",
  locked: "red",
  locked_takeover: "red",
};

export const getParticipantDisplayName = (
  participant: ContestParticipant | null | undefined
): string | null =>
  participant
    ? (
        participant.userDisplayName ||
        participant.displayName ||
        participant.nickname ||
        participant.username
      )
    : null;
