import { Tag } from "@carbon/react";
import { useTranslation } from "react-i18next";
import type { BoundContest } from "@/core/entities/classroom.entity";
import {
  getContestState,
  getContestStateColor,
  getContestStateLabel,
} from "@/core/entities/contest.entity";
import type { TimelineDayGroup } from "@/features/classroom/domain/classroomActivityTimeline";
import { formatDateTime, DATE_FORMATS } from "@/i18n/dateUtils";

export interface ClassroomActivityTimelineProps {
  groups: TimelineDayGroup[];
  heroContestId: string | null;
  onOpenContest: (contestId: string) => void;
}

const resolvedTimes = (c: BoundContest) => ({
  startIso: c.contestStartTime || c.boundAt,
  endIso: c.contestEndTime || c.boundAt,
});

const displayState = (c: BoundContest) => {
  const r = resolvedTimes(c);
  return getContestState({
    status: c.contestStatus,
    startTime: r.startIso,
    endTime: r.endIso,
  });
};

function formatDayHeading(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map((x) => Number.parseInt(x, 10));
  if (!y || !m || !d) return dateKey;
  const ms = new Date(y, m - 1, d, 12, 0, 0, 0).getTime();
  return formatDateTime(ms, DATE_FORMATS.DATE_ONLY);
}

export const ClassroomActivityTimeline: React.FC<ClassroomActivityTimelineProps> = ({
  groups,
  heroContestId,
  onOpenContest,
}) => {
  const { t } = useTranslation("classroom");

  const filteredGroups = heroContestId
    ? groups
        .map((g) => ({
          ...g,
          contests: g.contests.filter((c) => c.contestId !== heroContestId),
        }))
        .filter((g) => g.contests.length > 0)
    : groups;

  if (filteredGroups.length === 0) return null;

  return (
    <section
      className="classroom-admin-section classroom-activity-schedule__timeline"
      aria-labelledby="classroom-activity-timeline-heading"
    >
      <h2 id="classroom-activity-timeline-heading" className="classroom-activity-schedule__timeline-heading">
        {t("activitySchedule.timelineHeading", "活動時間軸")}
      </h2>
      <ol className="classroom-activity-schedule__timeline-list">
        {filteredGroups.map((group) => (
          <li key={group.dateKey} className="classroom-activity-schedule__day">
            <h3 className="classroom-activity-schedule__day-label">{formatDayHeading(group.dateKey)}</h3>
            <ul className="classroom-activity-schedule__contests">
              {group.contests.map((c) => {
                const { startIso, endIso } = resolvedTimes(c);
                const state = displayState(c);
                return (
                  <li key={c.contestId}>
                    <button
                      type="button"
                      className="classroom-activity-schedule__contest-button"
                      onClick={() => onOpenContest(c.contestId)}
                    >
                      <span className="classroom-activity-schedule__contest-name">{c.contestName}</span>
                      <span
                        className="classroom-activity-schedule__contest-meta"
                        style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", alignItems: "center" }}
                      >
                        <Tag type={getContestStateColor(state)} size="sm">
                          {getContestStateLabel(state)}
                        </Tag>
                        <span>
                          {formatDateTime(startIso, DATE_FORMATS.SHORT)} —{" "}
                          {formatDateTime(endIso, DATE_FORMATS.SHORT)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  );
};
