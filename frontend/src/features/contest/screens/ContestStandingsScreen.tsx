import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  DataTableSkeleton,
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
import { getContestStandings } from "@/infrastructure/api/repositories/contest.repository";
import { BlockHeader, type BlockHeaderProps } from "@/shared/components/dashboard";
import styles from "./ContestStandingsScreen.module.scss";

interface ContestStandingsPageProps {
  maxWidth?: string;
  titleSize?: BlockHeaderProps["titleSize"];
  /** Stretch to the host's height so the board scrolls inside it with a sticky header. */
  fill?: boolean;
  onSelectParticipant?: (userId: string, problemId?: string) => void;
}

const ContestStandingsPage: React.FC<ContestStandingsPageProps> = ({
  maxWidth,
  titleSize,
  fill = false,
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

  // Flat on purpose: the host (admin panel or student tab) owns the surface and
  // vertical scrolling, so the board never sits in a card with its own clip.
  return (
    <section
      className={`${styles.root}${fill ? ` ${styles.fill}` : ""}`}
      style={maxWidth ? { maxWidth, marginInline: "auto" } : undefined}
    >
      <BlockHeader
        title={t("standings.title")}
        titleAs="h2"
        titleSize={titleSize}
        description={t("standings.icpcRules")}
        actions={
          <Button
            kind="ghost"
            renderIcon={isRefreshing ? InlineLoading : Renew}
            onClick={() => void refreshStandings()}
            disabled={isRefreshing || loading}
            hasIconOnly
            iconDescription={
              isRefreshing ? t("standings.refreshing") : t("standings.refresh")
            }
          />
        }
      />

      {error ? (
        <InlineNotification
          kind="error"
          hideCloseButton
          title={t("standings.loadFailed", "無法載入排行榜")}
          subtitle={error.message}
        />
      ) : loading ? (
        renderSkeleton()
      ) : (
        <ContestScoreboard
          problems={problems}
          standings={standings}
          loading={false}
          className={fill ? styles.fillBoard : undefined}
          contestId={contest?.id}
          classroomId={contest?.boundClassroomId || undefined}
          onSelectParticipant={onSelectParticipant}
        />
      )}
    </section>
  );
};

export default ContestStandingsPage;
