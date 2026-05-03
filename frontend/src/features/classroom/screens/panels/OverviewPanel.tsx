import { useCallback, useMemo, useState } from "react";
import { Button } from "@carbon/react";
import { ArrowRight, Trophy } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type {
  BoundContest,
  ClassroomDetail,
  ClassroomAnnouncement,
} from "@/core/entities/classroom.entity";
import EntityOverviewFrame from "@/shared/layout/EntityOverviewFrame";
import { EmptyState } from "@/shared/ui/EmptyState";
import { ContestScheduleCard } from "@/shared/ui/scheduleCard";
import { AnnouncementSection } from "../../components/AnnouncementSection";
import { ClassroomContestPreviewModal } from "../../components/ClassroomContestPreviewModal";
import { ClassroomActivityTimeline } from "../../components/ClassroomActivityTimeline";
import "../../components/ClassroomActivitySchedule.scss";
import {
  buildCalendarDayRows,
  getUpcomingContestTasks,
} from "../../domain/classroomActivityTimeline";
import type { ClassroomAdminPanelId } from "../ClassroomAdminLayout";

const TIMELINE_PAGE_DAYS = 14;
const DAY_MS = 86_400_000;

interface OverviewPanelProps {
  classroom: ClassroomDetail;
  isPrivileged: boolean;
  onCreateAnnouncement: () => void;
  onViewAnnouncement: (announcement: ClassroomAnnouncement) => void;
  onNavigateExam: (contestId: string) => void;
  onJumpToPanel: (panel: ClassroomAdminPanelId) => void;
}

export const OverviewPanel: React.FC<OverviewPanelProps> = ({
  classroom,
  isPrivileged,
  onCreateAnnouncement,
  onViewAnnouncement,
  onNavigateExam,
  onJumpToPanel,
}) => {
  const { t } = useTranslation("classroom");

  const [nowMs] = useState(() => Date.now());
  const [timelineStartMs, setTimelineStartMs] = useState(
    () => nowMs - TIMELINE_PAGE_DAYS * DAY_MS,
  );
  const [timelineEndMs, setTimelineEndMs] = useState(
    () => nowMs + TIMELINE_PAGE_DAYS * DAY_MS,
  );
  const [previewContest, setPreviewContest] = useState<BoundContest | null>(
    null,
  );

  const timelineRows = useMemo(
    () =>
      buildCalendarDayRows(
        classroom.contests,
        classroom.announcements,
        timelineStartMs,
        timelineEndMs,
        nowMs,
      ),
    [
      classroom.announcements,
      classroom.contests,
      nowMs,
      timelineEndMs,
      timelineStartMs,
    ],
  );

  const upcomingTasks = useMemo(
    () => getUpcomingContestTasks(classroom.contests, nowMs, 3),
    [classroom.contests, nowMs],
  );

  const openContestPreview = (contestId: string) => {
    const contest = classroom.contests.find(
      (item) => item.contestId === contestId,
    );
    if (contest) setPreviewContest(contest);
  };

  const handleEnterPreviewContest = (contestId: string) => {
    setPreviewContest(null);
    onNavigateExam(contestId);
  };

  const handleLoadEarlier = useCallback(() => {
    setTimelineStartMs((current) => current - TIMELINE_PAGE_DAYS * DAY_MS);
  }, []);

  const handleLoadLater = useCallback(() => {
    setTimelineEndMs((current) => current + TIMELINE_PAGE_DAYS * DAY_MS);
  }, []);

  return (
    <>
      <EntityOverviewFrame
        className="classroom-overview-frame"
        sectionClassName="classroom-admin-overview-frame-section"
        main={
          <ClassroomActivityTimeline
            rows={timelineRows}
            onOpenContest={openContestPreview}
            onViewAnnouncement={onViewAnnouncement}
            onLoadEarlier={handleLoadEarlier}
            onLoadLater={handleLoadLater}
          />
        }
        side={
          <>
            <section className="classroom-admin-section classroom-admin-section--todo">
              <div className="classroom-admin-section__header">
                <div className="classroom-admin-section__title">
                  <h3>
                    {t("activitySchedule.upcomingTasks", "我的待辦 / 即將開始")}
                  </h3>
                </div>
              </div>
              {upcomingTasks.length === 0 ? (
                <EmptyState
                  icon={Trophy}
                  title={t(
                    "activitySchedule.noUpcomingTasks",
                    "目前沒有即將開始或進行中的考試/競賽",
                  )}
                  compact
                />
              ) : (
                <div className="classroom-overview-task-list">
                  {upcomingTasks.map((contest) => (
                    <ContestScheduleCard
                      key={contest.contestId}
                      contest={contest}
                      onClick={() => setPreviewContest(contest)}
                    />
                  ))}
                </div>
              )}
            </section>

            <AnnouncementSection
              announcements={classroom.announcements.slice(0, 4)}
              isPrivileged={isPrivileged}
              onCreateClick={onCreateAnnouncement}
              onView={onViewAnnouncement}
              compactEmpty
              title={t("latestAnnouncements")}
            />
            {classroom.announcements.length > 4 && (
              <Button
                kind="ghost"
                size="sm"
                renderIcon={ArrowRight}
                onClick={() => onJumpToPanel("announcements")}
              >
                {t("viewAllAnnouncements")}
              </Button>
            )}
          </>
        }
      />
      <ClassroomContestPreviewModal
        contest={previewContest}
        open={previewContest !== null}
        onClose={() => setPreviewContest(null)}
        onEnterContest={handleEnterPreviewContest}
      />
    </>
  );
};
