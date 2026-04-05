import { Button } from "@carbon/react";
import { Add, Trophy } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { BoundContest } from "@/core/entities/classroom.entity";
import { EmptyState } from "@/shared/ui/EmptyState";
import { ClassroomContestCard as ContestCard } from "../../components/ClassroomContestCard";

interface ContestPanelProps {
  exams: BoundContest[];
  canBindContests: boolean;
  onCreateExam: () => void;
  onNavigateExam: (contestId: string) => void;
}

export const ContestPanel: React.FC<ContestPanelProps> = ({
  exams,
  canBindContests,
  onCreateExam,
  onNavigateExam,
}) => {
  const { t } = useTranslation("classroom");

  return (
    <div className="classroom-admin-overview-layout">
      <section className="classroom-admin-section">
        <div className="classroom-admin-section__header">
          <div className="classroom-admin-section__title">
            <h3>{t("contests", "考試與競賽")}</h3>
          </div>
          {canBindContests && (
            <Button
              kind="ghost"
              size="sm"
              renderIcon={Add}
              data-testid="classroom-create-contest-btn"
              onClick={onCreateExam}
            >
              {t("createContest", "建立考試")}
            </Button>
          )}
        </div>

        {exams.length === 0 ? (
          <EmptyState icon={Trophy} title={t("noExamContests", "尚未建立考試或競賽")} />
        ) : (
          <div className="classroom-admin-card-grid">
            {exams.map((contest) => (
              <ContestCard
                key={contest.contestId}
                contest={contest}
                onNavigate={() => onNavigateExam(contest.contestId)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
