import { Tag } from "@carbon/react";
import {
  Archive,
  Calendar,
  CheckmarkFilled,
  InProgress,
} from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { BoundContest } from "@/core/entities/classroom.entity";
import {
  getContestState,
  getContestStateColor,
  getContestStateLabel,
  type ContestDisplayState,
} from "@/core/entities/contest.entity";
import { getBoundContestTimeRange } from "@/features/classroom/domain/classroomActivityTimeline";
import { ScheduleCard } from "../ScheduleCard";

// ── State → visual mapping ────────────────────────────────────────────────────

const ACCENT: Record<string, string> = {
  upcoming: "var(--cds-interactive)",
  running:  "var(--cds-support-success)",
  ended:    "var(--cds-border-strong-01)",
  archived: "var(--cds-text-disabled)",
};

function StateIcon({ state }: { state: ContestDisplayState }) {
  const props = { size: 16 };
  switch (state) {
    case "running":  return <InProgress {...props} />;
    case "ended":    return <CheckmarkFilled {...props} />;
    case "archived": return <Archive {...props} />;
    default:         return <Calendar {...props} />;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface ContestScheduleCardProps {
  contest: BoundContest;
  onClick?: () => void;
}

export function ContestScheduleCard({ contest, onClick }: ContestScheduleCardProps) {
  const { t } = useTranslation("classroom");

  const { startMs, endMs } = getBoundContestTimeRange(contest);
  const state = getContestState({
    status: contest.contestStatus,
    startTime: isNaN(startMs) ? undefined : new Date(startMs).toISOString(),
    endTime:   isNaN(endMs)   ? undefined : new Date(endMs).toISOString(),
  });

  const accent = ACCENT[state] ?? ACCENT.upcoming;
  const isMuted = state === "ended" || state === "archived";

  const deliveryLabel =
    contest.deliveryMode === "exam"
      ? t("contestDeliveryExam", "考試")
      : t("contestDeliveryPractice", "練習");

  return (
    <ScheduleCard.Root onClick={onClick} accentColor={accent} muted={isMuted}>
      <ScheduleCard.Header
        icon={<StateIcon state={state} />}
        tag={
          <Tag type={getContestStateColor(state)} size="sm">
            {getContestStateLabel(state)}
          </Tag>
        }
      >
        {contest.contestName}
      </ScheduleCard.Header>

      <ScheduleCard.Time
        start={contest.contestStartTime || contest.boundAt}
        end={contest.contestEndTime || contest.boundAt}
      />

      <ScheduleCard.Meta>
        {contest.contestOwnerUsername} · {deliveryLabel}
      </ScheduleCard.Meta>
    </ScheduleCard.Root>
  );
}
