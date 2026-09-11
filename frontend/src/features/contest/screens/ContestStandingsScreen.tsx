import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  Column,
  DataTableSkeleton,
  Grid,
  InlineLoading,
  InlineNotification,
} from "@carbon/react";
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
import { getContestStandings } from "@/infrastructure/api/repositories/contest.repository";

interface ContestStandingsPageProps {
  maxWidth?: string;
  onSelectParticipant?: (userId: string, problemId?: string) => void;
}

const ContestStandingsPage: React.FC<ContestStandingsPageProps> = ({
  maxWidth,
  onSelectParticipant,
}) => {
  const { t } = useTranslation("contest");

  const { contest } = useContest();
  const {
    data: scoreboardData,
    isLoading: standingsLoading,
    isFetching: isRefreshing,
    error,
    refetch: refreshStandings,
  } = useQuery({
    queryKey: ["contestStandings", contest?.id, contest?.currentUserRole],
    queryFn: () => getContestStandings(contest!.id),
    enabled: !!contest?.id,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    retry: false,
  });

  // Transform ScoreboardData to ContestScoreboard format
  const problems: ProblemInfo[] = useMemo(() => {
    if (!scoreboardData?.problems) return [];
    return scoreboardData.problems.map((p, index) => {
      const problemId = p.id?.toString() || p.problemId?.toString() || null;
      return {
        id: problemId ?? `problem-${index}`,
        title: p.title || p.label,
        order: p.order ?? index,
        label: p.label,
        problem_id: p.problemId?.toString() || problemId || undefined,
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
      <Grid fullWidth style={{ padding: 0 }}>
          <Column lg={16} md={8} sm={4}>
            <ContainerCard
              title={t("standings.title")}
              action={
                <Button
                  kind="ghost"
                  renderIcon={isRefreshing ? InlineLoading : Renew}
                  onClick={() => void refreshStandings()}
                  disabled={isRefreshing || loading}
                  hasIconOnly
                  iconDescription={
                    isRefreshing
                      ? t("standings.refreshing")
                      : t("standings.refresh")
                  }
                />
              }
              padding="none"
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
                {error ? (
                  <InlineNotification kind="error" hideCloseButton title={t("standings.loadFailed", "無法載入排行榜")} subtitle={error.message} />
                ) : loading ? (
                  renderSkeleton()
                ) : (
                  <ContestScoreboard
                    problems={problems}
                    standings={standings}
                    loading={false}
                    contestId={contest?.id}
                    classroomId={contest?.boundClassroomId || undefined}
                    onSelectParticipant={onSelectParticipant}
                  />
                )}
              </div>
            </ContainerCard>
          </Column>
      </Grid>
    </SurfaceSection>
  );
};

export default ContestStandingsPage;
