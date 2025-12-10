import { useMemo } from "react";
import { Button, InlineLoading, SkeletonText } from "@carbon/react";
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
  const { contest, scoreboardData, isRefreshing, refreshStandings } =
    useContest();

  // Transform ScoreboardData to ContestScoreboard format
  const problems: ProblemInfo[] = useMemo(() => {
    if (!scoreboardData?.problems) return [];
    return scoreboardData.problems.map((p, index) => ({
      id: parseInt(p.problemId) || index,
      title: p.label, // fallback to label as title
      order: index,
      label: p.label,
      problem_id: parseInt(p.problemId) || undefined,
    }));
  }, [scoreboardData?.problems]);

  const standings: StandingRow[] = useMemo(() => {
    if (!scoreboardData?.rows) return [];
    return scoreboardData.rows.map((row) => ({
      rank: row.rank,
      user: {
        id: parseInt(row.userId) || 0,
        username: row.displayName,
      },
      displayName: row.displayName,
      solved: row.solvedCount,
      total_score: 0,
      time: row.penalty,
      problems: Object.fromEntries(
        Object.entries(row.problems || {}).map(([key, cell]) => [
          key,
          {
            status:
              cell?.status === "AC"
                ? "AC"
                : cell?.status === "WA"
                ? "WA"
                : null,
            tries: cell?.attempts ?? 0,
            time: cell?.time ?? 0,
            pending: false,
          },
        ])
      ),
    }));
  }, [scoreboardData?.rows]);

  const loading = !contest;

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
                  <div style={{ padding: "1rem 0" }}>
                    <SkeletonText
                      heading
                      width="30%"
                      style={{ marginBottom: "1rem" }}
                    />
                    <SkeletonText paragraph lineCount={8} />
                  </div>
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
