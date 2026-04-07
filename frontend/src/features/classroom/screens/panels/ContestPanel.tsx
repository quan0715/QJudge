import { useMemo, useState } from "react";
import { Button } from "@carbon/react";
import { Add, Trophy } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { BoundContest } from "@/core/entities/classroom.entity";
import { getContestState } from "@/core/entities/contest.entity";
import { EmptyState } from "@/shared/ui/EmptyState";
import { ClassroomContestCard as ContestCard } from "../../components/ClassroomContestCard";

type ContestPanelFilter = "all" | "available" | "ended" | "draft";

interface ContestGroup {
  id: "available" | "ended" | "draft";
  label: string;
  contests: BoundContest[];
}

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
  const [filter, setFilter] = useState<ContestPanelFilter>("all");

  const groups = useMemo<ContestGroup[]>(() => {
    const sorted = [...exams].sort((a, b) => {
      const aMs = new Date(a.contestStartTime || a.boundAt).getTime();
      const bMs = new Date(b.contestStartTime || b.boundAt).getTime();
      return aMs - bMs;
    });

    const contestsWithState = sorted.map((contest) => ({
      contest,
      state: getContestState({
        status: contest.contestStatus,
        startTime: contest.contestStartTime || contest.boundAt,
        endTime: contest.contestEndTime || contest.boundAt,
      }),
    }));

    const available = contestsWithState
      .filter(({ state }) => state === "upcoming" || state === "running")
      .map(({ contest }) => contest);
      
    const ended = contestsWithState
      .filter(({ state }) => state === "ended" || state === "archived")
      .map(({ contest }) => contest);
      
    const draft = sorted.filter((contest) => contest.contestStatus === "draft");

    return [
      {
        id: "available",
        label: t("contestGroupAvailable", "可進入 / 即將開始"),
        contests: available,
      },
      { id: "ended", label: t("contestGroupEnded", "已結束"), contests: ended },
      { id: "draft", label: t("contestGroupDraft", "草稿"), contests: draft },
    ];
  }, [exams, t]);

  const visibleGroups = groups.filter((group) =>
    filter === "all" ? group.contests.length > 0 : group.id === filter,
  );

  const filters: Array<{
    id: ContestPanelFilter;
    label: string;
    count: number;
  }> = [
    { id: "all", label: t("contestFilterAll", "全部"), count: exams.length },
    {
      id: "available",
      label: t("contestFilterAvailable", "可進入"),
      count:
        groups.find((group) => group.id === "available")?.contests.length ?? 0,
    },
    {
      id: "ended",
      label: t("contestFilterEnded", "已結束"),
      count: groups.find((group) => group.id === "ended")?.contests.length ?? 0,
    },
    {
      id: "draft",
      label: t("contestFilterDraft", "草稿"),
      count: groups.find((group) => group.id === "draft")?.contests.length ?? 0,
    },
  ];

  return (
    <div className="classroom-admin-catalog-layout">
      <section className="classroom-admin-section">
        <div className="classroom-admin-section__header">
          <div className="classroom-admin-section__title">
            <h3>{t("contests", "考試與競賽")}</h3>
            <p>
              {t("contestCatalogSubtitle", "{{count}} 個評測活動", {
                count: exams.length,
              })}
            </p>
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
          <EmptyState
            icon={Trophy}
            title={t("noExamContests", "尚未建立考試或競賽")}
          />
        ) : (
          <div className="classroom-admin-contest-catalog">
            <div
              className="classroom-admin-contest-filters"
              role="group"
              aria-label={t("contestFilters", "競賽篩選")}
            >
              {filters.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={filter === item.id}
                  className={[
                    "classroom-admin-contest-filter",
                    filter === item.id
                      ? "classroom-admin-contest-filter--selected"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => setFilter(item.id)}
                >
                  <span>{item.label}</span>
                  <strong>{item.count}</strong>
                </button>
              ))}
            </div>

            {visibleGroups.length === 0 ||
            visibleGroups.every((group) => group.contests.length === 0) ? (
              <EmptyState
                icon={Trophy}
                title={t("contestFilterEmpty", "這個分類目前沒有競賽")}
                compact
              />
            ) : (
              visibleGroups.map((group) => (
                <section
                  key={group.id}
                  className="classroom-admin-contest-group"
                >
                  <div className="classroom-admin-contest-group__header">
                    <h4>{group.label}</h4>
                    <span>
                      {t("contestGroupCount", "{{count}} 個", {
                        count: group.contests.length,
                      })}
                    </span>
                  </div>
                  <div className="classroom-admin-card-grid">
                    {group.contests.map((contest) => (
                      <ContestCard
                        key={contest.contestId}
                        contest={contest}
                        onNavigate={() => onNavigateExam(contest.contestId)}
                      />
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>
        )}
      </section>
    </div>
  );
};
