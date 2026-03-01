import { useMemo } from "react";
import { Button, InlineLoading, DataTableSkeleton } from "@carbon/react";
import { Renew } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { useContest } from "@/features/contest/contexts/ContestContext";
import ContestScoreboard from "@/features/contest/components/ContestScoreboard";
import type {
  ProblemInfo,
  StandingRow,
} from "@/features/contest/components/ContestScoreboard";
import SurfaceSection from "@/shared/layout/SurfaceSection";
import ContainerCard from "@/shared/layout/ContainerCard";

interface ContestStandingsPageProps {
  maxWidth?: string;
}

const ContestStandingsPage: React.FC<ContestStandingsPageProps> = ({
  maxWidth,
}) => {
  const { t } = useTranslation("contest");

  // Use standings from context - no local fetch needed
  const {
    contest,
    scoreboardData,
    standingsLoading,
    isRefreshing,
    refreshStandings,
  } = useContest();

  // Transform ScoreboardData to ContestScoreboard format
  const problems: ProblemInfo[] = useMemo(() => {
    if (!scoreboardData?.problems) return [];
    return scoreboardData.problems.map((p, index) => {
      const problemId = p.id ?? (p.problemId ? Number(p.problemId) : null);
      return {
        id: problemId ?? index,
        title: p.title || p.label,
        order: p.order ?? index,
        label: p.label,
        problem_id: problemId ?? undefined,
        score: p.score || 0,
      };
    });
  }, [scoreboardData?.problems]);

  const standings: StandingRow[] = useMemo(() => {
    if (!scoreboardData?.rows) return [];
    return scoreboardData.rows.map((row) => ({
      rank: row.rank,
      user: {
        id: Number(row.userId) || 0,
        username: row.displayName,
      },
      displayName: row.displayName,
      solved: row.solvedCount,
      total_score: row.totalScore || 0,
      time: row.penalty,
      problems: Object.fromEntries(
        Object.entries(row.problems || {}).map(([key, cell]) => {
          const contestCell = cell as {
            status?: string | null;
            score?: number | null;
            tries?: number | null;
            time?: number | null;
            pending?: boolean | null;
          };
          return [
            key,
            {
              status:
                contestCell.status === "AC"
                  ? "AC"
                  : contestCell.status
                    ? "WA"
                    : null,
              score: contestCell.score ?? 0,
              tries: contestCell.tries ?? 0,
              time: contestCell.time ?? 0,
              pending: contestCell.pending ?? false,
            },
          ];
        })
      ),
    }));
  }, [scoreboardData?.rows]);

  const loading = !contest || standingsLoading;

  // Skeleton for table loading
  const renderSkeleton = () => (
    <DataTableSkeleton
      columnCount={7}
      rowCount={10}
      headers={[
        { key: "rank", header: t("standings.rank") },
        { key: "user", header: t("standings.participant") },
        { key: "solved", header: t("standings.solved") },
        { key: "penalty", header: t("standings.penalty") },
        { key: "p1", header: "A" },
        { key: "p2", header: "B" },
        { key: "p3", header: "C" },
      ]}
      showHeader
      showToolbar={false}
    />
  );

  return (
    <SurfaceSection maxWidth={maxWidth} style={{ minHeight: "100%", flex: 1 }}>
      <div className="cds--grid" style={{ padding: 0 }}>
        <div className="cds--row">
          <div className="cds--col-lg-16">
            <ContainerCard
              title={t("standings.title")}
              action={
                <Button
                  kind="ghost"
                  renderIcon={isRefreshing ? InlineLoading : Renew}
                  onClick={refreshStandings}
                  disabled={isRefreshing || loading}
                  hasIconOnly
                  iconDescription={
                    isRefreshing
                      ? t("standings.refreshing")
                      : t("standings.refresh")
                  }
                />
              }
              noPadding
            >
              <div style={{ padding: "1rem" }}>
                <p
                  style={{
                    marginBottom: "1rem",
                    color: "var(--cds-text-secondary)",
                  }}
                >
                  {t("standings.icpcRules")}
                </p>
                {loading ? (
                  renderSkeleton()
                ) : (
                  <ContestScoreboard
                    problems={problems}
                    standings={standings}
                    loading={false}
                    contestId={contest?.id}
                  />
                )}
              </div>
            </ContainerCard>
          </div>
        </div>
      </div>
    </SurfaceSection>
  );
};

export default ContestStandingsPage;
