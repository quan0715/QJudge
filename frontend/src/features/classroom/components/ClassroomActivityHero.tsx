import { Button, ClickableTile, Stack, Tag } from "@carbon/react";
import { Add, Trophy } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { BoundContest } from "@/core/entities/classroom.entity";
import {
  getContestState,
  getContestStateColor,
  getContestStateLabel,
} from "@/core/entities/contest.entity";
import { formatDateTime, DATE_FORMATS } from "@/i18n/dateUtils";
import { EmptyState } from "@/shared/ui/EmptyState";

export interface ClassroomActivityHeroProps {
  contest: BoundContest | null;
  isPrivileged: boolean;
  onOpenContest: (contestId: string) => void;
  onCreateExam?: () => void;
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

export const ClassroomActivityHero: React.FC<ClassroomActivityHeroProps> = ({
  contest,
  isPrivileged,
  onOpenContest,
  onCreateExam,
}) => {
  const { t } = useTranslation("classroom");

  if (!contest) {
    return (
      <section
        className="classroom-admin-section classroom-activity-schedule__hero-section"
        aria-labelledby="classroom-activity-hero-heading"
      >
        <div className="classroom-admin-section__header">
          <div className="classroom-admin-section__title">
            <h2 id="classroom-activity-hero-heading" className="cds--type-heading-03">
              {t("activitySchedule.heroTitle", "下一場活動")}
            </h2>
          </div>
          {isPrivileged && onCreateExam ? (
            <Button kind="ghost" size="sm" renderIcon={Add} onClick={onCreateExam}>
              {t("createContest", "建立考試")}
            </Button>
          ) : null}
        </div>
        <EmptyState
          icon={Trophy}
          title={t("activitySchedule.emptyTitle", "目前沒有進行中或即將開始的活動")}
          description={t(
            "activitySchedule.emptySubtitle",
            "當教室有已發布且尚未結束的活動時，會顯示在這裡。",
          )}
          compact
        />
      </section>
    );
  }

  const { startIso, endIso } = resolvedTimes(contest);
  const state = displayState(contest);
  const stateLabel = getContestStateLabel(state);
  const stateColor = getContestStateColor(state);

  return (
    <section
      className="classroom-admin-section classroom-activity-schedule__hero-section"
      aria-labelledby="classroom-activity-hero-heading"
    >
      <div className="classroom-admin-section__header">
        <div className="classroom-admin-section__title">
          <h2 id="classroom-activity-hero-heading" className="cds--type-heading-03">
            {t("activitySchedule.heroTitle", "下一場活動")}
          </h2>
        </div>
        {isPrivileged && onCreateExam ? (
          <Button kind="ghost" size="sm" renderIcon={Add} onClick={onCreateExam}>
            {t("createContest", "建立考試")}
          </Button>
        ) : null}
      </div>
      <ClickableTile
        className="classroom-activity-schedule__hero-tile"
        onClick={() => onOpenContest(contest.contestId)}
      >
        <Stack gap={4}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
            <h3 className="classroom-activity-schedule__hero-title">{contest.contestName}</h3>
            <Tag type={stateColor}>{stateLabel}</Tag>
          </div>
          <div className="classroom-activity-schedule__hero-meta">
            <span>
              {formatDateTime(startIso, DATE_FORMATS.SHORT)} — {formatDateTime(endIso, DATE_FORMATS.SHORT)}
            </span>
          </div>
        </Stack>
      </ClickableTile>
    </section>
  );
};
