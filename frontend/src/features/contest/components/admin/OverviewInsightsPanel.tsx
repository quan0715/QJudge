import { useEffect, useMemo, useState } from "react";
import { ProgressBar, Tag, Tile } from "@carbon/react";
import { useTranslation } from "react-i18next";
import type { ContestDetail, ContestOverviewMetrics } from "@/core/entities/contest.entity";
import { getContestState, getContestStateColor, getContestStateLabel } from "@/core/entities/contest.entity";
import {
  resolveOverviewSnapshot,
  formatDuration,
  calculateContestTimeProgressAt,
} from "./overviewMetrics.utils";
import styles from "./OverviewInsightsPanel.module.scss";

interface OverviewInsightsPanelProps {
  contest: ContestDetail;
  overviewMetrics: ContestOverviewMetrics | null;
}

export default function OverviewInsightsPanel({
  contest,
  overviewMetrics,
}: OverviewInsightsPanelProps) {
  const { t } = useTranslation("contest");
  const snapshot = resolveOverviewSnapshot(contest, overviewMetrics);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const contestState = getContestState(contest);
  const startAt = contest.startTime ? new Date(contest.startTime).toLocaleString() : "-";
  const endAt = contest.endTime ? new Date(contest.endTime).toLocaleString() : "-";
  const liveTimeProgress = useMemo(
    () => calculateContestTimeProgressAt(contest, nowMs),
    [contest, nowMs],
  );

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timerId);
    };
  }, []);

  return (
    <aside className={styles.panel}>
      <h3 className={styles.title}>
        {t("adminOverview.sidebar.title", "考試摘要")}
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

      <Tile className={styles.tile}>
        <div className={styles.tileHeader}>
          <span>{t("adminOverview.sidebar.online", "在線狀態")}</span>
        </div>
        <div className={styles.metricRow}>
          <span>{t("adminOverview.sidebar.heartbeatOnline", "Heartbeat 在線")}</span>
          <strong>{snapshot.onlineNow}</strong>
        </div>
        <div className={styles.metricRow}>
          <span>{t("adminOverview.sidebar.activeSessions", "Active Sessions")}</span>
          <strong>{snapshot.onlineActiveSessions}</strong>
        </div>
      </Tile>

      <Tile className={styles.tile}>
        <div className={styles.tileHeader}>
          <span>{t("adminOverview.sidebar.settings", "競賽設定")}</span>
        </div>
        <div className={styles.metricRow}>
          <span>{t("adminOverview.sidebar.contestState", "競賽狀態")}</span>
          <Tag size="sm" type={getContestStateColor(contestState)}>
            {getContestStateLabel(contestState)}
          </Tag>
        </div>
        <div className={styles.metricRow}>
          <span>{t("adminOverview.sidebar.strictMode", "嚴格考試模式")}</span>
          <Tag size="sm" type={contest.cheatDetectionEnabled ? "green" : "cool-gray"}>
            {contest.cheatDetectionEnabled
              ? t("adminOverview.sidebar.enabled", "已啟用")
              : t("adminOverview.sidebar.disabled", "未啟用")}
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
      </Tile>
    </aside>
  );
}
