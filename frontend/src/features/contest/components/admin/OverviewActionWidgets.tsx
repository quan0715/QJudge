import { useEffect, useMemo, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { ProgressBar, Tile, SkeletonText, Tag } from "@carbon/react";
import {
  ChevronRight,
  Education,
  Time,
  UserMultiple,
  TaskComplete,
} from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { ContestDetail, ContestOverviewMetrics } from "@/core/entities/contest.entity";
import type { ParticipantStatusKpi } from "@/features/contest/screens/admin/participantStatusKpi";
import type { AdminPanelId } from "@/features/contest/modules/types";
import {
  calculateContestTimeProgressAt,
  formatDuration,
  resolveOverviewSnapshot,
} from "./overviewMetrics.utils";
import styles from "./OverviewActionWidgets.module.scss";

interface OverviewActionWidgetsProps {
  contest: ContestDetail;
  kpi: ParticipantStatusKpi;
  overviewMetrics: ContestOverviewMetrics | null;
  loading?: boolean;
  onOpenPanel: (panel: AdminPanelId) => void;
  onPublishContest: () => Promise<void>;
  onPublishResults: () => Promise<void>;
}

interface WidgetCardProps {
  title: string;
  icon: ComponentType<{ size: number; className?: string }>;
  value: ReactNode;
  unit?: string;
  description: ReactNode;
  cta: string;
  onClick: () => void;
  statusTag?: ReactNode;
}

const WidgetCard = ({
  title,
  icon: Icon,
  value,
  unit,
  description,
  cta,
  onClick,
  statusTag,
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
          <Icon size={20} className={styles.widgetIcon} />
          <h3 className={styles.widgetTitle}>{title}</h3>
        </div>
        {statusTag}
      </div>
      <div className={styles.widgetValue}>
        <span>{value}</span>
        {unit && <span className={styles.widgetUnit}>{unit}</span>}
      </div>
      <div className={styles.widgetDescription}>{description}</div>
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
  overviewMetrics,
  loading = false,
  onOpenPanel,
  onPublishContest,
  onPublishResults,
}: OverviewActionWidgetsProps) {
  const { t } = useTranslation("contest");
  const snapshot = resolveOverviewSnapshot(contest, overviewMetrics);
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
  const workItemCount =
    contest.contestType === "paper_exam"
      ? contest.examQuestionsCount
      : contest.problems.length;
  const workItemLabel =
    contest.contestType === "paper_exam"
      ? t("adminOverview.widgets.paperExam", "考卷題目")
      : t("adminOverview.widgets.coding", "程式題");

  const statusLabel =
    contestStatus === "draft"
      ? t("common:status.draft", "草稿")
      : contestStatus === "published"
        ? t("common:status.published", "已發布")
        : t("common:status.archived", "已封存");

  const nextStepLabel = useMemo(() => {
    if (contestStatus === "draft") {
      return t("adminOverview.widgets.nextStepDraft", "先完成設定再發布");
    }
    if (contestStatus === "published" && !liveTimeProgress.isEnded) {
      return t("adminOverview.widgets.nextStepRunning", "考試進行中");
    }
    if (contestStatus === "published" && !contest.resultsPublished) {
      return t("adminOverview.widgets.nextStepResults", "考試結束後可發布成績");
    }
    if (contestStatus === "published" && contest.resultsPublished) {
      return t("adminOverview.widgets.nextStepGrading", "前往批改與檢視成績");
    }
    return t("adminOverview.widgets.nextStepArchived", "競賽已封存");
  }, [contest.resultsPublished, contestStatus, liveTimeProgress.isEnded, t]);

  const gradingStatusLabel = useMemo(() => {
    if (contest.resultsPublished) {
      return t("adminOverview.widgets.gradingPublished", "成績已發布");
    }
    if (contestStatus === "draft") {
      return t("adminOverview.widgets.gradingDraft", "待發布競賽");
    }
    if (!liveTimeProgress.isEnded) {
      return t("adminOverview.widgets.gradingRunning", "考試進行中");
    }
    return t("adminOverview.widgets.gradingPending", "待發布成績");
  }, [contest.resultsPublished, contestStatus, liveTimeProgress.isEnded, t]);

  const gradingStatusTag = useMemo(() => {
    if (contest.resultsPublished) {
      return (
        <Tag className={styles.statusTag} type="green" size="sm">
          {t("adminOverview.widgets.published", "已發布")}
        </Tag>
      );
    }
    if (contestStatus === "draft") {
      return (
        <Tag className={styles.statusTag} type="gray" size="sm">
          {t("common:status.draft", "草稿")}
        </Tag>
      );
    }
    if (!liveTimeProgress.isEnded) {
      return (
        <Tag className={styles.statusTag} type="blue" size="sm">
          {t("adminOverview.widgets.inProgress", "進行中")}
        </Tag>
      );
    }
    return (
      <Tag className={styles.statusTag} type="cool-gray" size="sm">
        {t("adminOverview.widgets.unpublished", "未發布")}
      </Tag>
    );
  }, [contest.resultsPublished, contestStatus, liveTimeProgress.isEnded, t]);

  const statusAction = useMemo(() => {
    if (contestStatus === "draft") {
      return {
        cta: t("adminOverview.actions.publishContest", "發布競賽"),
        onClick: () => {
          void onPublishContest();
        },
        tag: <Tag className={styles.statusTag} type="gray" size="sm">{statusLabel}</Tag>,
      };
    }

    if (contestStatus === "published" && !liveTimeProgress.isEnded) {
      return {
        cta: t("adminOverview.actions.editSettings", "編輯設定"),
        onClick: () => onOpenPanel("settings"),
        tag: <Tag className={styles.statusTag} type="green" size="sm">{statusLabel}</Tag>,
      };
    }

    if (contestStatus === "published" && !contest.resultsPublished) {
      return {
        cta: t("adminOverview.actions.publishResults", "發布成績"),
        onClick: () => {
          void onPublishResults();
        },
        tag: <Tag className={styles.statusTag} type="green" size="sm">{statusLabel}</Tag>,
      };
    }

    if (contestStatus === "published" && contest.resultsPublished) {
      return {
        cta: t("adminOverview.actions.viewGrading", "查看批改"),
        onClick: () => onOpenPanel("grading"),
        tag: <Tag className={styles.statusTag} type="green" size="sm">{statusLabel}</Tag>,
      };
    }

    return {
      cta: t("adminOverview.actions.editSettings", "編輯設定"),
      onClick: () => onOpenPanel("settings"),
      tag: <Tag className={styles.statusTag} type="cool-gray" size="sm">{statusLabel}</Tag>,
    };
  }, [
    contest.resultsPublished,
    contestStatus,
    liveTimeProgress.isEnded,
    onOpenPanel,
    onPublishContest,
    onPublishResults,
    statusLabel,
    t,
  ]);

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
        <Tile className={styles.progressCard}>
          <SkeletonText width="32%" />
          <SkeletonText heading width="46%" />
          <SkeletonText width="88%" />
          <SkeletonText width="52%" />
        </Tile>
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
          description={nextStepLabel}
          cta={statusAction.cta}
          onClick={statusAction.onClick}
          statusTag={statusAction.tag}
        />

        <WidgetCard
          title={t("adminOverview.widgets.participants", "參賽者")}
          icon={UserMultiple}
          value={kpi.totalParticipants}
          unit={t("adminOverview.kpi.personUnit", "人")}
          description={t("adminOverview.widgets.participantsHint", "已交卷 {{submitted}} / {{total}}", {
            submitted: kpi.submittedCount,
            total: kpi.totalParticipants,
          })}
          cta={t("adminOverview.widgets.viewStatistics", "查看統計")}
          onClick={() => onOpenPanel("statistics")}
          statusTag={<Tag className={styles.statusTag} type="cool-gray" size="sm">{t(`adminOverview.examStatus.${snapshot.examStatus}`)}</Tag>}
        />

        <WidgetCard
          title={t("adminOverview.widgets.questions", "題目數量")}
          icon={Education}
          value={workItemCount}
          unit={t("adminOverview.kpi.problemUnit", "題")}
          description={workItemLabel}
          cta={t("adminOverview.widgets.goProblems", "前往題目")}
          onClick={() => onOpenPanel("problem_editor")}
          statusTag={<Tag className={styles.statusTag} type="blue" size="sm">{contest.contestType === "paper_exam" ? t("adminOverview.widgets.paperExamShort", "考卷") : t("adminOverview.widgets.codingShort", "程式題")}</Tag>}
        />

        <WidgetCard
          title={t("adminOverview.widgets.gradingStatus", "考試批改狀態")}
          icon={Time}
          value={gradingStatusLabel}
          description={t("adminOverview.widgets.gradingHint", "已交卷 {{submitted}} / {{total}}", {
            submitted: kpi.submittedCount,
            total: kpi.totalParticipants,
          })}
          cta={t("adminOverview.actions.viewGrading", "前往批改")}
          onClick={() => onOpenPanel("grading")}
          statusTag={gradingStatusTag}
        />
      </div>

      <Tile className={styles.progressCard}>
        <div className={styles.progressHeader}>
          <div className={styles.progressTitleRow}>
            <Time size={20} className={styles.widgetIcon} />
            <h3 className={styles.widgetTitle}>{t("adminOverview.widgets.examProgress", "考試進度")}</h3>
          </div>
          <Tag className={styles.statusTag} type="cool-gray" size="sm">
            {Math.round(liveTimeProgress.progressPercent)}%
          </Tag>
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
        <p className={styles.progressHint}>
          {liveTimeProgress.isEnded
            ? t("adminOverview.time.ended", "已結束")
            : liveTimeProgress.isStarted
              ? t("adminOverview.time.remaining", "剩餘 {{time}}", {
                  time: formatDuration(liveTimeProgress.remainingSeconds),
                })
              : t("adminOverview.time.untilStart", "距離開始 {{time}}", {
                  time: formatDuration(countdownSeconds),
                })}
        </p>
      </Tile>
    </section>
  );
}
