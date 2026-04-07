import { useMemo, useState } from "react";
import { Button } from "@carbon/react";
import { ArrowRight } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { ClassroomDetail, ClassroomAnnouncement } from "@/core/entities/classroom.entity";
import EntityOverviewFrame from "@/shared/layout/EntityOverviewFrame";
import { AnnouncementSection } from "../../components/AnnouncementSection";
import { ClassroomActivityTimeline } from "../../components/ClassroomActivityTimeline";
import "../../components/ClassroomActivitySchedule.scss";
import { buildCalendarDayRows } from "../../domain/classroomActivityTimeline";
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
  const [startOffset, setStartOffset] = useState(-3);
  const [endOffset, setEndOffset] = useState(3);

  const startMs = useMemo(() => {
    const d = new Date(nowMs);
    d.setDate(d.getDate() + startOffset);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, [nowMs, startOffset]);

  const endMs = useMemo(() => {
    const d = new Date(nowMs);
    d.setDate(d.getDate() + endOffset);
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  }, [nowMs, endOffset]);

  const calRows = useMemo(
    () => buildCalendarDayRows(classroom.contests, classroom.announcements, startMs, endMs, nowMs),
    [classroom.contests, classroom.announcements, startMs, endMs, nowMs],
  );

  return (
    <EntityOverviewFrame
      sectionClassName="classroom-admin-overview-frame-section"
      main={
        <ClassroomActivityTimeline
          rows={calRows}
          onOpenContest={onNavigateExam}
          onViewAnnouncement={onViewAnnouncement}
          onLoadEarlier={() => setStartOffset((o) => o - 7)}
          onLoadLater={() => setEndOffset((o) => o + 7)}
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
