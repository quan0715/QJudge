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
import { ScheduleCard, type ScheduleCardColor } from "../ScheduleCard";

// ── State → visual mapping ────────────────────────────────────────────────────

function stateToColor(state: ContestDisplayState): ScheduleCardColor {
  switch (state) {
    case "running":  return "green";
    case "ended":
    case "archived": return "gray";
    default:         return "blue";
  }
}

function StateIcon({ state }: { state: ContestDisplayState }) {
  const props = { size: 20 };
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

  const color = stateToColor(state);
  const tagColor = getContestStateColor(state);
  const label = getContestStateLabel(state);
  const isMuted = state === "ended" || state === "archived";

  const deliveryLabel =
    contest.deliveryMode === "exam"
      ? t("contestDeliveryExam", "考試")
      : t("contestDeliveryPractice", "練習");

  return (
    <ScheduleCard.Root onClick={onClick} muted={isMuted}>
      <ScheduleCard.Badge icon={<StateIcon state={state} />} color={color} />

      <ScheduleCard.Content>
        <ScheduleCard.Title>{contest.contestName}</ScheduleCard.Title>
        <ScheduleCard.Time
          start={contest.contestStartTime || contest.boundAt}
          end={contest.contestEndTime   || contest.boundAt}
        />
        <ScheduleCard.Meta>
          {contest.contestOwnerUsername} · {deliveryLabel}
        </ScheduleCard.Meta>
      </ScheduleCard.Content>

      <ScheduleCard.Aside>
        <Tag type={tagColor} size="sm">{label}</Tag>
      </ScheduleCard.Aside>
    </ScheduleCard.Root>
  );
}
