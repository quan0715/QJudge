import { Button } from "@carbon/react";
import { Add, ArrowRight, Trophy } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { ClassroomDetail, ClassroomAnnouncement, BoundContest } from "@/core/entities/classroom.entity";
import EntityOverviewFrame from "@/shared/layout/EntityOverviewFrame";
import { EmptyBlock } from "../../components/EmptyBlock";
import { AnnouncementSection } from "../../components/AnnouncementSection";
import { ClassroomContestCard as ContestCard, getActivityTimestamp } from "../../components/ClassroomContestCard";
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
  onCreateExam,
  onNavigateExam,
  onJumpToPanel,
}) => {
  const { t } = useTranslation("classroom");
  const activeExams = classroom.contests.filter((row) => row.contestStatus === "published");
  const recentActivities = [...activeExams]
    .sort((left, right) => {
      const leftTime = getActivityTimestamp(left);
      const rightTime = getActivityTimestamp(right);
      return rightTime.localeCompare(leftTime);
    })
    .slice(0, 3);

  return (
    <EntityOverviewFrame
      sectionClassName="classroom-admin-overview-frame-section"
      main={
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
      side={
        <>
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

          <section className="classroom-admin-section">
            <div className="classroom-admin-section__header">
              <div className="classroom-admin-section__title">
                <h3>{t("recentActivities", "近期活動")}</h3>
              </div>
              {isPrivileged && (
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <Button kind="ghost" size="sm" renderIcon={Add} onClick={onCreateExam}>
                    {t("createContest", "建立考試")}
                  </Button>
                </div>
              )}
            </div>

            {recentActivities.length === 0 ? (
              <EmptyBlock
                icon={Trophy}
                message={t("noActiveContests", "目前沒有進行中或即將開始的活動")}
                compact
              />
            ) : (
              <div className="classroom-admin-card-grid">
                {recentActivities.map((activity) => (
                  <ContestCard
                    key={activity.contestId}
                    contest={activity}
                    onNavigate={() => onNavigateExam(activity.contestId)}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      }
    />
  );
};
