import { useMemo } from "react";
import { Button, InlineLoading, DataTableSkeleton } from "@carbon/react";
import { Renew } from "@carbon/icons-react";
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
    return scoreboardData.problems.map((p: any, index) => ({
      id: parseInt(p.problemId) || index,
      title: p.title || p.label, // fallback to label as title
      order: p.order ?? index,
      label: p.label,
      problem_id: parseInt(p.problemId) || undefined,
      score: p.score || 0, // Include problem score
    }));
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
            status:
              cell?.status === "AC"
                ? "AC"
                : cell?.status === "WA"
                ? "WA"
                : null,
            score: cell?.score ?? 0, // Include score for AC display
            tries: cell?.attempts ?? 0,
            time: cell?.time ?? 0,
            pending: false,
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
        { key: "rank", header: "排名" },
        { key: "user", header: "參賽者" },
        { key: "solved", header: "解題數" },
        { key: "penalty", header: "罰時" },
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
              title="即時排行榜"
              action={
                <Button
                  kind="ghost"
                  renderIcon={isRefreshing ? InlineLoading : Renew}
                  onClick={refreshStandings}
                  disabled={isRefreshing || loading}
                  size="sm"
                  hasIconOnly
                  iconDescription={isRefreshing ? "更新中..." : "重新整理"}
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
                  ICPC 規則：排名優先依據解題數，其次為總罰時（解題時間 +
                  20分鐘/錯誤嘗試）。
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
