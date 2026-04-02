import { useEffect, useMemo, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { ProgressBar, Tile, SkeletonText } from "@carbon/react";
import {
  ChevronRight,
  Education,
  Time,
  UserMultiple,
  TaskComplete,
  Warning,
} from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { ContestDetail } from "@/core/entities/contest.entity";
import type { ParticipantStatusKpi } from "@/features/contest/screens/admin/participantStatusKpi";
import type { AdminPanelId } from "@/features/contest/modules/types";
import {
  calculateContestTimeProgressAt,
  formatDuration,
} from "./overviewMetrics.utils";
import styles from "./OverviewActionWidgets.module.scss";

interface OverviewActionWidgetsProps {
  contest: ContestDetail;
  kpi: ParticipantStatusKpi;
  violationCount: number;
  loading?: boolean;
  onOpenPanel: (panel: AdminPanelId) => void;
  onPublishContest: () => Promise<void>;
  onRevertContestToDraft: () => Promise<void>;
  onPublishResults: (progressPercent?: number) => Promise<void>;
  onRevokeResults: () => Promise<void>;
  onToggleStrictMode: () => Promise<void>;
}

interface WidgetCardProps {
  title: string;
  icon: ComponentType<{ size: number; className?: string }>;
  value: ReactNode;
  unit?: string;
  cta: string;
  onClick: () => void;
}

const WidgetCard = ({
  title,
  icon: Icon,
  value,
  unit,
  cta,
  onClick,
}: WidgetCardProps) => (
  <button
    type="button"
    className={styles.widgetButton}
    onClick={onClick}
    aria-label={`${title} ${cta}`}
  >
    <Tile className={styles.widgetCard}>
      <div className={styles.widgetHeader}>
        <div className={styles.widgetTitleRow}>
          <Icon size={16} className={styles.widgetIcon} />
          <h3 className={styles.widgetTitle}>{title}</h3>
        </div>
      </div>
      <div className={styles.widgetValue}>
        <span>{value}</span>
        {unit && <span className={styles.widgetUnit}>{unit}</span>}
      </div>
      <div className={styles.widgetFooter}>
        <span>{cta}</span>
        <span className={styles.widgetCta}>
          <ChevronRight size={16} />
        </span>
      </div>
    </Tile>
  </button>
);

export default function OverviewActionWidgets({
  contest,
  kpi,
  violationCount,
  loading = false,
  onOpenPanel,
  onPublishContest,
  onRevertContestToDraft,
  onPublishResults,
  onRevokeResults,
  onToggleStrictMode,
}: OverviewActionWidgetsProps) {
  const { t } = useTranslation("contest");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const contestStatus = contest.status ?? "draft";
  const liveTimeProgress = useMemo(
    () => calculateContestTimeProgressAt(contest, nowMs),
    [contest, nowMs],
  );
  const countdownSeconds = useMemo(() => {
    const startAtMs = Date.parse(contest.startTime ?? "");
    if (!Number.isFinite(startAtMs)) {
      return 0;
    }
    return Math.max(0, Math.floor((startAtMs - nowMs) / 1000));
  }, [contest.startTime, nowMs]);
  const contestWindowText = useMemo(() => {
    const formatDateTime = (value: string | undefined): string => {
      const ts = Date.parse(value ?? "");
      if (!Number.isFinite(ts)) return "--";
      return new Date(ts).toLocaleString();
    };
    return `${formatDateTime(contest.startTime)} -> ${formatDateTime(contest.endTime)}`;
  }, [contest.endTime, contest.startTime]);
  const workItemCount =
    contest.contestType === "paper_exam"
      ? contest.examQuestionsCount
      : contest.problems.length;
  const canToggleStatus = contest.permissions?.canToggleStatus !== false;
  const canEditContest = contest.permissions?.canEditContest !== false;
  const gradingProgressPercent =
    kpi.totalParticipants > 0
      ? Math.round((kpi.submittedCount / kpi.totalParticipants) * 100)
      : 0;

  const statusLabel =
    contestStatus === "draft"
      ? t("common:status.draft", "草稿")
      : contestStatus === "published"
        ? t("common:status.published", "已發布")
        : t("common:status.archived", "已封存");

  const gradingStatusLabel = useMemo(() => {
    if (contest.resultsPublished) {
      return t("adminOverview.widgets.gradingPublished", "已發布");
    }
    if (contestStatus === "draft") {
      return t("adminOverview.widgets.gradingDraft", "待發布");
    }
    if (!liveTimeProgress.isEnded) {
      return t("adminOverview.widgets.gradingRunning", "進行中");
    }
    return t("adminOverview.widgets.gradingPending", "待發布成績");
  }, [contest.resultsPublished, contestStatus, liveTimeProgress.isEnded, t]);

  const statusAction = useMemo<{ cta: string; onClick: () => void }>(() => {
    if (contestStatus === "draft") {
      return {
        cta: t("adminOverview.actions.publishContest", "發布競賽"),
        onClick: () => {
          void onPublishContest();
        },
      };
    }

    if (contestStatus === "published") {
      return {
        cta: t("adminOverview.actions.revertToDraft", "退回草稿"),
        onClick: () => {
          void onRevertContestToDraft();
        },
      };
    }

    return {
      cta: t("adminOverview.actions.publishContest", "發布競賽"),
      onClick: () => {
        void onPublishContest();
      },
    };
  }, [
    contestStatus,
    onPublishContest,
    onRevertContestToDraft,
    t,
  ]);

  const gradingAction = useMemo<{ cta: string; onClick: () => void }>(() => {
    if (contest.resultsPublished) {
      return {
        cta: t("adminOverview.actions.revokeResults", "撤回發布"),
        onClick: () => {
          void onRevokeResults();
        },
      };
    }
    return {
      cta: t("adminOverview.actions.publishResults", "發布成績"),
      onClick: () => {
        void onPublishResults(gradingProgressPercent);
      },
    };
  }, [contest.resultsPublished, gradingProgressPercent, onPublishResults, onRevokeResults, t]);

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
      <section className={styles.section}>
        <div className={styles.header}>
          <h3 className={styles.title}>{t("adminOverview.widgets.title", "控制台")}</h3>
          <p className={styles.subtitle}>{t("adminOverview.widgets.subtitle", "快速進入設定、題目與狀態操作")}</p>
        </div>
        <div className={styles.grid}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Tile key={i} className={styles.widgetCard}>
              <SkeletonText width="55%" />
              <SkeletonText heading width="45%" />
              <SkeletonText width="80%" />
              <SkeletonText width="70%" />
            </Tile>
          ))}
        </div>
        <div className={styles.bottomGrid}>
          <Tile className={`${styles.progressCard} ${styles.progressSpan2}`}>
            <SkeletonText width="32%" />
            <SkeletonText heading width="46%" />
            <SkeletonText width="88%" />
            <SkeletonText width="52%" />
          </Tile>
          <Tile className={styles.widgetCard}>
            <SkeletonText width="48%" />
            <SkeletonText heading width="40%" />
            <SkeletonText width="70%" />
          </Tile>
          <Tile className={styles.widgetCard}>
            <SkeletonText width="48%" />
            <SkeletonText heading width="40%" />
            <SkeletonText width="70%" />
          </Tile>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <h3 className={styles.title}>{t("adminOverview.widgets.title", "控制台")}</h3>
        <p className={styles.subtitle}>{t("adminOverview.widgets.subtitle", "快速進入設定、題目與狀態操作")}</p>
      </div>

      <div className={styles.grid}>
        <WidgetCard
          title={t("adminOverview.widgets.status", "競賽狀態")}
          icon={TaskComplete}
          value={statusLabel}
          cta={statusAction.cta}
          onClick={() => {
            if (!canToggleStatus) return;
            statusAction.onClick();
          }}
        />

        <WidgetCard
          title={t("adminOverview.widgets.strictExamMode", "嚴格考試模式")}
          icon={TaskComplete}
          value={
            contest.cheatDetectionEnabled
              ? t("adminOverview.widgets.enabled", "已啟用")
              : t("adminOverview.widgets.disabled", "未啟用")
          }
          cta={
            contest.cheatDetectionEnabled
              ? t("adminOverview.actions.disableStrictExamMode", "停用模式")
              : t("adminOverview.actions.enableStrictExamMode", "啟用模式")
          }
          onClick={() => {
            if (!canEditContest) return;
            void onToggleStrictMode();
          }}
        />

        <WidgetCard
          title={t("adminOverview.widgets.questions", "題目數量")}
          icon={Education}
          value={workItemCount}
          unit={t("adminOverview.kpi.problemUnit", "題")}
          cta={t("adminOverview.widgets.goProblemManagement", "前往題目管理")}
          onClick={() => onOpenPanel("problem_editor")}
        />

        <WidgetCard
          title={t("adminOverview.widgets.gradingStatus", "考試批改狀態")}
          icon={Time}
          value={`${gradingProgressPercent}%`}
          unit={gradingStatusLabel}
          cta={gradingAction.cta}
          onClick={() => {
            if (!canEditContest) return;
            gradingAction.onClick();
          }}
        />
      </div>

      <div className={styles.bottomGrid}>
        <Tile className={`${styles.progressCard} ${styles.progressSpan2}`}>
          <div className={styles.progressHeader}>
            <div className={styles.progressTitleRow}>
              <Time size={16} className={styles.widgetIcon} />
              <h3 className={styles.widgetTitle}>{t("adminOverview.widgets.examProgress", "考試進度")}</h3>
            </div>
            <span className={styles.progressPercent}>
              {Math.round(liveTimeProgress.progressPercent)}%
            </span>
          </div>
          <div className={styles.progressValue}>
            {formatDuration(liveTimeProgress.elapsedSeconds)}
            <span className={styles.widgetUnit}>/ {formatDuration(liveTimeProgress.totalSeconds)}</span>
          </div>
          <ProgressBar
            className={styles.progressBar}
            hideLabel
            label={t("adminOverview.widgets.examProgress", "考試進度")}
            size="small"
            value={liveTimeProgress.progressPercent}
          />
          <div className={styles.progressFooter}>
            <div className={styles.progressWindowText}>{contestWindowText}</div>
            <div className={styles.progressStatusText}>
              {liveTimeProgress.isEnded
                ? t("adminOverview.time.ended", "已結束")
                : liveTimeProgress.isStarted
                  ? t("adminOverview.time.remaining", "剩餘 {{time}}", {
                      time: formatDuration(liveTimeProgress.remainingSeconds),
                    })
                  : t("adminOverview.time.untilStart", "距離開始 {{time}}", {
                      time: formatDuration(countdownSeconds),
                    })}
            </div>
          </div>
        </Tile>

        <button
          type="button"
          className={styles.widgetButton}
          aria-label={t("adminOverview.widgets.violationCountAria", "違規次數 前往事件面板")}
          onClick={() => onOpenPanel("logs")}
        >
          <Tile className={styles.widgetCard}>
            <div className={styles.widgetHeader}>
              <div className={styles.widgetTitleRow}>
                <Warning size={16} className={styles.widgetIcon} />
                <h3 className={styles.widgetTitle}>{t("adminOverview.widgets.violationCount", "違規次數")}</h3>
              </div>
            </div>
            <div className={styles.widgetValue}>
              <span>{violationCount}</span>
              <span className={styles.widgetUnit}>{t("adminOverview.kpi.caseUnit", "次")}</span>
            </div>
            <div className={styles.widgetFooter}>
              <span>{t("adminOverview.widgets.goEventPanel", "前往事件面板")}</span>
              <span className={styles.widgetCta}>
                <ChevronRight size={16} />
              </span>
            </div>
          </Tile>
        </button>

        <WidgetCard
          title={t("adminOverview.widgets.participants", "參賽者")}
          icon={UserMultiple}
          value={kpi.totalParticipants}
          unit={t("adminOverview.kpi.personUnit", "人")}
          cta={t("adminOverview.widgets.goParticipantList", "進入參賽者列表")}
          onClick={() => onOpenPanel("participants")}
        />
      </div>
    </section>
  );
}
