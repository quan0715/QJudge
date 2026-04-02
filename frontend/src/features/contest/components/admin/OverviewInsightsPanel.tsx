import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ProgressBar, SkeletonText, Tag, Tile } from "@carbon/react";
import { ChevronRight } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { ContestDetail, ContestOverviewMetrics } from "@/core/entities/contest.entity";
import type { AdminPanelId } from "@/features/contest/modules/types";
import {
  resolveOverviewSnapshot,
  formatDuration,
  calculateContestTimeProgressAt,
} from "./overviewMetrics.utils";
import styles from "./OverviewInsightsPanel.module.scss";

interface OverviewInsightsPanelProps {
  contest: ContestDetail;
  overviewMetrics: ContestOverviewMetrics | null;
  loading?: boolean;
  onOpenPanel: (panel: AdminPanelId) => void;
}

interface ActionTileProps {
  title: string;
  description: string;
  onClick: () => void;
  children: ReactNode;
}

const ActionTile = ({ title, description, onClick, children }: ActionTileProps) => (
  <button
    type="button"
    className={styles.actionTileButton}
    onClick={onClick}
    aria-label={title}
  >
    <Tile className={`${styles.tile} ${styles.actionTile}`}>
      <div className={styles.actionTileHeader}>
        <div className={styles.actionTileTitleRow}>
          <span className={styles.actionTileTitle}>{title}</span>
          <ChevronRight size={16} className={styles.actionTileChevron} />
        </div>
        <span className={styles.actionTileDescription}>{description}</span>
      </div>
      <div className={styles.actionTileBody}>{children}</div>
    </Tile>
  </button>
);

export default function OverviewInsightsPanel({
  contest,
  overviewMetrics,
  loading = false,
  onOpenPanel,
}: OverviewInsightsPanelProps) {
  const { t } = useTranslation("contest");
  const snapshot = resolveOverviewSnapshot(contest, overviewMetrics);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const contestStatus = contest.status ?? "draft";
  const startAt = contest.startTime ? new Date(contest.startTime).toLocaleString() : "-";
  const endAt = contest.endTime ? new Date(contest.endTime).toLocaleString() : "-";
  const liveTimeProgress = useMemo(
    () => calculateContestTimeProgressAt(contest, nowMs),
    [contest, nowMs],
  );
  const workItemCount = contest.contestType === "paper_exam"
    ? contest.examQuestionsCount
    : contest.problems.length;
  const workItemUnit = contest.contestType === "paper_exam"
    ? t("adminOverview.sidebar.questions", "questions")
    : t("adminOverview.sidebar.problems", "problems");
  const nextStep = useMemo(() => {
    if (contestStatus === "draft") {
      return t(
        "adminOverview.sidebar.nextStepDraft",
        "下一步：先完成題目與設定，再發布競賽",
      );
    }

    if (contestStatus === "published" && !liveTimeProgress.isEnded) {
      return t(
        "adminOverview.sidebar.nextStepPublished",
        "下一步：檢查題目與考試時段",
      );
    }

    if (contestStatus === "published" && !contest.resultsPublished) {
      return t(
        "adminOverview.sidebar.nextStepPublishResults",
        "下一步：考試結束後發布成績",
      );
    }

    if (contestStatus === "published" && contest.resultsPublished) {
      return t(
        "adminOverview.sidebar.nextStepResultsPublished",
        "下一步：前往批改與檢視成績",
      );
    }

    return t("adminOverview.sidebar.nextStepArchived", "競賽已封存");
  }, [contest.resultsPublished, contestStatus, liveTimeProgress.isEnded, t]);

  const statusLabel =
    contestStatus === "draft"
      ? t("common:status.draft", "草稿")
      : contestStatus === "published"
        ? t("common:status.published", "已發布")
        : t("common:status.archived", "已封存");
  const statusColor =
    contestStatus === "draft"
      ? "gray"
      : contestStatus === "published"
        ? "green"
        : "cool-gray";

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timerId);
    };
  }, []);

  if (loading) {
    return (
      <aside className={styles.panel}>
        <h3 className={styles.title}>
          {t("adminOverview.sidebar.title", "狀態與入口")}
        </h3>
        {Array.from({ length: 3 }).map((_, i) => (
          <Tile key={i} className={styles.tile}>
            <SkeletonText width="50%" />
            <SkeletonText heading width="70%" />
            <SkeletonText width="100%" />
            <SkeletonText width="80%" />
          </Tile>
        ))}
      </aside>
    );
  }

  return (
    <aside className={styles.panel}>
      <h3 className={styles.title}>
        {t("adminOverview.sidebar.title", "狀態與入口")}
      </h3>

      <Tile className={styles.tile}>
        <div className={styles.tileHeader}>
          <span>{t("adminOverview.sidebar.timeAndWindow", "時間進度與考試時段")}</span>
          <Tag size="sm" type="blue">
            {t(`adminOverview.examStatus.${snapshot.examStatus}`)}
          </Tag>
        </div>
        <div className={styles.mainValue}>
          {formatDuration(liveTimeProgress.elapsedSeconds)} / {formatDuration(liveTimeProgress.totalSeconds)}
        </div>
        <ProgressBar
          label={t("adminOverview.sidebar.timeProgress", "時間進度")}
          hideLabel
          size="small"
          value={liveTimeProgress.progressPercent}
        />
        <div className={styles.subText}>
          {liveTimeProgress.isEnded
            ? t("adminOverview.time.ended", "已結束")
            : liveTimeProgress.isStarted
              ? t("adminOverview.time.remaining", "剩餘 {{time}}", {
                  time: formatDuration(liveTimeProgress.remainingSeconds),
                })
              : t("adminOverview.time.notStarted", "尚未開始")}
        </div>
        <div className={styles.windowRow}>
          <span>{t("adminOverview.sidebar.start", "開始")}</span>
          <span>{startAt}</span>
        </div>
        <div className={styles.windowRow}>
          <span>{t("adminOverview.sidebar.end", "結束")}</span>
          <span>{endAt}</span>
        </div>
      </Tile>

      <ActionTile
        title={t("adminOverview.sidebar.contestState", "競賽狀態")}
        description={nextStep}
        onClick={() => onOpenPanel("settings")}
      >
        <div className={styles.metricRow}>
          <span>{t("adminOverview.sidebar.statusLabel", "目前狀態")}</span>
          <Tag size="sm" type={statusColor}>
            {statusLabel}
          </Tag>
        </div>
        <div className={styles.metricRow}>
          <span>{t("adminOverview.sidebar.resultsPublished", "成績發布")}</span>
          <Tag size="sm" type={contest.resultsPublished ? "green" : "cool-gray"}>
            {contest.resultsPublished
              ? t("adminOverview.sidebar.published", "已發布")
              : t("adminOverview.sidebar.unpublished", "未發布")}
          </Tag>
        </div>
      </ActionTile>

      <ActionTile
        title={t("adminOverview.sidebar.problemCount", "題目數量")}
        description={t(
          "adminOverview.sidebar.problemCountHelp",
          "前往題目編輯與匯入入口",
        )}
        onClick={() => onOpenPanel("problem_editor")}
      >
        <div className={styles.problemCountRow}>
          <span className={styles.problemCountValue}>{workItemCount}</span>
          <span className={styles.problemCountUnit}>{workItemUnit}</span>
        </div>
        <div className={styles.problemCountMeta}>
          {contest.contestType === "paper_exam"
            ? t("adminOverview.sidebar.problemCountPaper", "考卷題目")
            : t("adminOverview.sidebar.problemCountCoding", "程式題目")}
        </div>
      </ActionTile>

    </aside>
  );
}
