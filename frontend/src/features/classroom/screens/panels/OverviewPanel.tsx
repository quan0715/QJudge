import { useMemo, useState } from "react";
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
import "../../components/ClassroomActivitySchedule.scss";
import { getUpcomingContestTasks } from "../../domain/classroomActivityTimeline";
import type { ClassroomAdminPanelId } from "../ClassroomAdminLayout";

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
  const [previewContest, setPreviewContest] = useState<BoundContest | null>(
    null,
  );

  const upcomingTasks = useMemo(
    () => getUpcomingContestTasks(classroom.contests, nowMs, 6),
    [classroom.contests, nowMs],
  );

  const handleEnterPreviewContest = (contestId: string) => {
    setPreviewContest(null);
    onNavigateExam(contestId);
  };

  return (
    <>
      <EntityOverviewFrame
        className="classroom-overview-frame"
        sectionClassName="classroom-admin-overview-frame-section"
        main={
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
        }
        side={
          <>
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
