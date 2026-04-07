import { useMemo, useState } from "react";
import { Button } from "@carbon/react";
import { ArrowRight } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { ClassroomDetail, ClassroomAnnouncement } from "@/core/entities/classroom.entity";
import EntityOverviewFrame from "@/shared/layout/EntityOverviewFrame";
import { AnnouncementSection } from "../../components/AnnouncementSection";
import { ClassroomActivityTimeline } from "../../components/ClassroomActivityTimeline";
import "../../components/ClassroomActivitySchedule.scss";
import { buildAllTimelineDayGroups } from "../../domain/classroomActivityTimeline";
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

  const timelineGroups = useMemo(
    () => buildAllTimelineDayGroups(classroom.contests, classroom.announcements, nowMs),
    [classroom.contests, classroom.announcements, nowMs],
  );

  return (
    <EntityOverviewFrame
      sectionClassName="classroom-admin-overview-frame-section"
      main={
        <ClassroomActivityTimeline
          groups={timelineGroups}
          onOpenContest={onNavigateExam}
          onViewAnnouncement={onViewAnnouncement}
        />
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
          {!isPrivileged && (
            <section className="classroom-admin-section classroom-admin-section--todo">
              <div className="classroom-admin-section__header">
                <div className="classroom-admin-section__title">
                  <h3>{t("studentTodo", "我的待辦")}</h3>
                </div>
              </div>
              <div className="classroom-admin-todo-list">
                <button type="button" onClick={() => onJumpToPanel("announcements")}>
                  <span>{t("announcements")}</span>
                  <strong>{classroom.announcements.length}</strong>
                </button>
                <button type="button" onClick={() => onJumpToPanel("contests")}>
                  <span>{t("contests", "考試")}</span>
                  <strong>{classroom.contests.length}</strong>
                </button>
              </div>
            </section>
          )}
        </>
      }
    />
  );
};
