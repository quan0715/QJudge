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
import {
  ClassroomMonthSchedule,
  type ClassroomScheduleViewMode,
} from "../../components/ClassroomMonthSchedule";
import "../../components/ClassroomActivitySchedule.scss";
import {
  buildClassroomMonthSchedule,
  buildClassroomWeekSchedule,
  getUpcomingContestTasks,
  localDateKeyFromMs,
} from "../../domain/classroomActivityTimeline";
import type { ClassroomAdminPanelId } from "../ClassroomAdminLayout";

interface OverviewPanelProps {
  classroom: ClassroomDetail;
  isPrivileged: boolean;
  onCreateAnnouncement: () => void;
  onViewAnnouncement: (announcement: ClassroomAnnouncement) => void;
  onCreateExam: () => void;
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
  const [scheduleViewMode, setScheduleViewMode] =
    useState<ClassroomScheduleViewMode>("month");
  const [rangeAnchor, setRangeAnchor] = useState(() => {
    const date = new Date(nowMs);
    date.setHours(0, 0, 0, 0);
    return date;
  });
  const [selectedDateKey, setSelectedDateKey] = useState(() =>
    localDateKeyFromMs(nowMs),
  );
  const [previewContest, setPreviewContest] = useState<BoundContest | null>(
    null,
  );

  const scheduleCells = useMemo(
    () =>
      scheduleViewMode === "week"
        ? buildClassroomWeekSchedule(classroom.contests, rangeAnchor, nowMs)
        : buildClassroomMonthSchedule(classroom.contests, rangeAnchor, nowMs),
    [classroom.contests, rangeAnchor, scheduleViewMode, nowMs],
  );

  const effectiveSelectedDateKey = useMemo(() => {
    if (scheduleCells.some((cell) => cell.dateKey === selectedDateKey))
      return selectedDateKey;
    const firstEventCell = scheduleCells.find(
      (cell) => cell.isCurrentMonth && cell.events.length > 0,
    );
    const firstCurrentMonthCell = scheduleCells.find(
      (cell) => cell.isCurrentMonth,
    );
    return (
      firstEventCell?.dateKey ??
      firstCurrentMonthCell?.dateKey ??
      scheduleCells[0]?.dateKey ??
      selectedDateKey
    );
  }, [scheduleCells, selectedDateKey]);

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

  const handlePreviousRange = useCallback(() => {
    setRangeAnchor((current) => {
      const next = new Date(current);
      if (scheduleViewMode === "week") {
        next.setDate(current.getDate() - 7);
      } else {
        next.setMonth(current.getMonth() - 1);
      }
      return next;
    });
  }, [scheduleViewMode]);

  const handleNextRange = useCallback(() => {
    setRangeAnchor((current) => {
      const next = new Date(current);
      if (scheduleViewMode === "week") {
        next.setDate(current.getDate() + 7);
      } else {
        next.setMonth(current.getMonth() + 1);
      }
      return next;
    });
  }, [scheduleViewMode]);

  return (
    <>
      <EntityOverviewFrame
        className="classroom-overview-frame"
        sectionClassName="classroom-admin-overview-frame-section"
        main={
          <ClassroomMonthSchedule
            cells={scheduleCells}
            rangeAnchor={rangeAnchor}
            viewMode={scheduleViewMode}
            selectedDateKey={effectiveSelectedDateKey}
            onViewModeChange={setScheduleViewMode}
            onSelectDate={setSelectedDateKey}
            onOpenContest={openContestPreview}
            onPreviousRange={handlePreviousRange}
            onNextRange={handleNextRange}
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
