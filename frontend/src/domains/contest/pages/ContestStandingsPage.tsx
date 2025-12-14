import { useMemo } from "react";
import { Button, InlineLoading, DataTableSkeleton } from "@carbon/react";
import { Renew } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { useContest } from "@/domains/contest/contexts/ContestContext";
import ContestScoreboard from "@/domains/contest/components/ContestScoreboard";
import type {
  ProblemInfo,
  StandingRow,
} from "@/domains/contest/components/ContestScoreboard";
import SurfaceSection from "@/ui/components/layout/SurfaceSection";
import ContainerCard from "@/ui/components/layout/ContainerCard";

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
    return scoreboardData.problems.map((p: any, index) => {
      // Use p.id directly (from API), fallback to problemId string, then index
      const problemId = p.id ?? (p.problemId ? parseInt(p.problemId) : null);
      return {
        id: problemId ?? index,
        title: p.title || p.label, // fallback to label as title
        order: p.order ?? index,
        label: p.label,
        problem_id: problemId ?? undefined,
        score: p.score || 0, // Include problem score
      };
    });
  }, [scoreboardData?.problems]);

  const standings: StandingRow[] = useMemo(() => {
    if (!scoreboardData?.rows) return [];
    return scoreboardData.rows.map((row: any) => ({
      rank: row.rank,
      user: {
        id: parseInt(row.userId) || 0,
        username: row.displayName,
      },
      displayName: row.displayName,
      solved: row.solvedCount,
      total_score: row.totalScore || row.total_score || 0,
      time: row.penalty,
      problems: Object.fromEntries(
        Object.entries(row.problems || {}).map(([key, cell]: [string, any]) => [
          key,
          {
            // Keep original status from API (AC, WA, CE, RE, TLE, etc.)
            // Treat non-AC statuses as "WA" for display purposes
            status: cell?.status === "AC" ? "AC" : cell?.status ? "WA" : null,
            score: cell?.score ?? 0,
            tries: cell?.tries ?? 0,
            time: cell?.time ?? 0,
            pending: cell?.pending ?? false,
          },
        ])
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
                  size="sm"
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
