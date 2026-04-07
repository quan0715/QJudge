import { Tag } from "@carbon/react";
import {
  Archive,
  Calendar,
  CheckmarkFilled,
  InProgress,
} from "@carbon/icons-react";
import type { BoundContest } from "@/core/entities/classroom.entity";
import {
  getContestState,
  getContestStateColor,
  getContestStateLabel,
  type ContestDisplayState,
} from "@/core/entities/contest.entity";
import { ScheduleCard } from "../ScheduleCard";

const ACCENT: Record<string, string> = {
  upcoming: "var(--cds-border-strong-01)",
  running: "var(--cds-support-success)",
  ended: "var(--cds-border-strong-01)",
  archived: "var(--cds-text-disabled)",
};

function StateIcon({ state }: { state: ContestDisplayState }) {
  const props = { size: 16 };
  switch (state) {
    case "running":
      return <InProgress {...props} />;
    case "ended":
      return <CheckmarkFilled {...props} />;
    case "archived":
      return <Archive {...props} />;
    default:
      return <Calendar {...props} />;
  }
}

function getBoundContestTimeRange(contest: BoundContest): {
  startMs: number;
  endMs: number;
} {
  const startIso = contest.contestStartTime || contest.boundAt;
  const endIso = contest.contestEndTime || contest.boundAt;
  return {
    startMs: new Date(startIso).getTime(),
    endMs: new Date(endIso).getTime(),
  };
}

export interface ContestScheduleCardProps {
  contest: BoundContest;
  onClick?: () => void;
  /** Show time-only (HH:mm) instead of full date+time. Use inside calendar. */
  timeOnly?: boolean;
}

export function ContestScheduleCard({
  contest,
  onClick,
  timeOnly,
}: ContestScheduleCardProps) {
  const { startMs, endMs } = getBoundContestTimeRange(contest);
  const state = getContestState({
    status: contest.contestStatus,
    startTime: isNaN(startMs) ? undefined : new Date(startMs).toISOString(),
    endTime: isNaN(endMs) ? undefined : new Date(endMs).toISOString(),
  });

  const accent = ACCENT[state] ?? ACCENT.upcoming;
  const isMuted = state === "ended" || state === "archived";

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
        timeOnly={timeOnly}
      />

      {contest.contestDescription && (
        <ScheduleCard.Description>
          {contest.contestDescription}
        </ScheduleCard.Description>
      )}
    </ScheduleCard.Root>
  );
}
