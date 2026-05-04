import { useEffect, useMemo, useState } from "react";
import { ProgressBar, Tile, SkeletonText } from "@carbon/react";
import {
  Education,
  Time,
  TaskComplete,
  Undo,
  Security,
  Edit,
  Send,
  Locked,
  Login,
  CheckmarkOutline,
  Calendar,
} from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { ContestDetail } from "@/core/entities/contest.entity";
import { ActionWidgetCard } from "@/shared/ui/dataCard";
import type { ParticipantStatusKpi } from "@/features/contest/screens/admin/participantStatusKpi";
import type { GlobalStats } from "@/features/contest/screens/settings/grading/gradingTypes";
import type { AdminPanelId } from "@/features/contest/modules/types";
import {
  calculateContestTimeProgressAt,
  formatDuration,
} from "./overviewMetrics.utils";
import styles from "./OverviewActionWidgets.module.scss";

interface OverviewActionWidgetsProps {
  contest: ContestDetail;
  kpi: ParticipantStatusKpi;
  gradingStats?: GlobalStats;
  loading?: boolean;
  onOpenPanel: (panel: AdminPanelId) => void;
  onOpenChecklist?: () => void;
  onPublishContest: () => Promise<void>;
  onRevertContestToDraft: () => Promise<void>;
  onPublishResults: (progressPercent?: number) => Promise<void>;
  onRevokeResults: () => Promise<void>;
  onToggleStrictMode: () => Promise<void>;
  onRequestToggleAllowMultipleJoins?: () => Promise<void>;
  onRequestTogglePassword?: () => Promise<void>;
  onOpenScheduleSettings?: () => void;
}


export default function OverviewActionWidgets({
  contest,
  gradingStats,
  loading = false,
  onOpenPanel,
  onOpenChecklist,
  onPublishContest,
  onRevertContestToDraft,
  onPublishResults,
  onRevokeResults,
  onToggleStrictMode,
  onRequestToggleAllowMultipleJoins,
  onRequestTogglePassword,
  onOpenScheduleSettings,
}: OverviewActionWidgetsProps) {
  const { t } = useTranslation("contest");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [countdownBaseSeconds, setCountdownBaseSeconds] = useState<number>(0);
  const contestStatus = contest.status ?? "draft";
  const startAtMs = useMemo(() => Date.parse(contest.startTime ?? ""), [contest.startTime]);
  const endAtMs = useMemo(() => Date.parse(contest.endTime ?? ""), [contest.endTime]);
  const hasSchedule = Number.isFinite(startAtMs) && Number.isFinite(endAtMs) && endAtMs > startAtMs;
  const liveTimeProgress = useMemo(
    () => calculateContestTimeProgressAt(contest, nowMs),
    [contest, nowMs],
  );
  const countdownSeconds = useMemo(() => {
    if (!Number.isFinite(startAtMs)) {
      return 0;
    }
    return Math.max(0, Math.floor((startAtMs - nowMs) / 1000));
  }, [nowMs, startAtMs]);
  const countdownProgress = useMemo(() => {
    if (countdownBaseSeconds <= 0) return 0;
    return Math.max(0, Math.min(100, (countdownSeconds / countdownBaseSeconds) * 100));
  }, [countdownBaseSeconds, countdownSeconds]);
  const { startTimeLabel, endTimeLabel } = useMemo(() => {
    const fmt = (value: string | undefined): string => {
      const ts = Date.parse(value ?? "");
      if (!Number.isFinite(ts)) return t("adminOverview.time.unset", "未設定");
      const d = new Date(ts);
      const month = (d.getMonth() + 1).toString().padStart(2, "0");
      const day = d.getDate().toString().padStart(2, "0");
      const hours = d.getHours().toString().padStart(2, "0");
      const mins = d.getMinutes().toString().padStart(2, "0");
      return `${month}/${day} ${hours}:${mins}`;
    };
    return { startTimeLabel: fmt(contest.startTime), endTimeLabel: fmt(contest.endTime) };
  }, [contest.endTime, contest.startTime, t]);
  const workItemCount =
    contest.contestType === "paper_exam"
      ? contest.examQuestionsCount
      : contest.problems.length;
  const canToggleStatus = contest.permissions?.canToggleStatus !== false;
  const canEditContest = contest.permissions?.canEditContest !== false;
  const gradingProgressPercent = gradingStats && gradingStats.totalAnswers > 0
    ? Math.round((gradingStats.gradedAnswers / gradingStats.totalAnswers) * 100)
    : 0;

  const statusLabel =
    contestStatus === "draft"
      ? t("common:status.draft", "草稿")
      : contestStatus === "published"
        ? t("common:status.published", "已發布")
        : t("common:status.archived", "已封存");
  const isDraftMode = contestStatus === "draft";
  const enabledColor = "var(--cds-support-success, #198038)";
  const disabledColor = "var(--cds-support-error, #da1e28)";
  const draftColor = "var(--cds-support-warning, #f1c21b)";
  const hasRules = (contest.rules ?? "").trim().length > 0;
  const hasWorkItems = workItemCount > 0;
  const publishTodoCount = (hasWorkItems ? 0 : 1) + (hasSchedule ? 0 : 1) + (hasRules ? 0 : 1);
  const scheduleActionText = hasSchedule
    ? t("adminOverview.time.editTime", "編輯時間")
    : t("adminOverview.time.configure", "設定時間");

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

  useEffect(() => {
    if (!hasSchedule) {
      setCountdownBaseSeconds(0);
      return;
    }
    if (countdownSeconds > 0 && countdownBaseSeconds === 0) {
      setCountdownBaseSeconds(countdownSeconds);
      return;
    }
    if (countdownSeconds === 0 && countdownBaseSeconds !== 0) {
      setCountdownBaseSeconds(0);
    }
  }, [countdownBaseSeconds, countdownSeconds, hasSchedule]);

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
        <ActionWidgetCard
          title={t("adminOverview.widgets.status", "競賽狀態")}
          icon={TaskComplete}
          actionIcon={Undo}
          actionIntent="danger"
          value={statusLabel}
          valueColor={contestStatus === "draft" ? draftColor : undefined}
          cta={statusAction.cta}
          onClick={() => {
            if (!canToggleStatus) return;
            statusAction.onClick();
          }}
        />

        <ActionWidgetCard
          title={t("adminOverview.widgets.strictExamMode", "防作弊監控")}
          icon={Security}
          actionIcon={Security}
          actionIntent="toggle"
          active={contest.cheatDetectionEnabled}
          value={
            contest.cheatDetectionEnabled
              ? t("adminOverview.widgets.enabled", "已啟用")
              : t("adminOverview.widgets.disabled", "未啟用")
          }
          valueColor={contest.cheatDetectionEnabled ? enabledColor : disabledColor}
          dangerBorder={!contest.cheatDetectionEnabled}
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

        <ActionWidgetCard
          title={t("adminOverview.widgets.questions", "題目數量")}
          icon={Education}
          actionIcon={Edit}
          actionIntent="navigate"
          value={workItemCount}
          unit={t("adminOverview.kpi.problemUnit", "題")}
          cta={t("adminOverview.widgets.goProblemManagement", "前往題目管理")}
          onClick={() => onOpenPanel("problem_editor")}
        />

        {isDraftMode ? (
          <ActionWidgetCard
            title={t("adminOverview.widgets.allowRejoin", "允許重新加入")}
            icon={Login}
            actionIcon={Security}
            actionIntent="toggle"
            active={contest.allowMultipleJoins}
            value={contest.allowMultipleJoins
              ? t("adminOverview.widgets.enabled", "已啟用")
              : t("adminOverview.widgets.disabled", "未啟用")}
            valueColor={contest.allowMultipleJoins ? enabledColor : disabledColor}
            dangerBorder={!contest.allowMultipleJoins}
            cta={contest.allowMultipleJoins
              ? t("adminOverview.actions.disableAllowRejoin", "停用重進")
              : t("adminOverview.actions.enableAllowRejoin", "啟用重進")}
            onClick={() => {
              if (!canEditContest || !onRequestToggleAllowMultipleJoins) return;
              void onRequestToggleAllowMultipleJoins();
            }}
          />
        ) : (
          <ActionWidgetCard
            title={t("adminOverview.widgets.gradingStatus", "考試批改狀態")}
            icon={Time}
            actionIcon={Send}
            actionIntent="toggle"
            active={contest.resultsPublished}
            value={`${gradingProgressPercent}%`}
            unit={gradingStatusLabel}
            progress={gradingProgressPercent}
            cta={gradingAction.cta}
            onClick={() => {
              if (!canEditContest) return;
              gradingAction.onClick();
            }}
          />
        )}
      </div>

      <div className={styles.bottomGrid}>
        <button
          type="button"
          className={`${styles.progressButton} ${styles.progressSpan2}`}
          aria-label={`${t("adminOverview.widgets.examProgress", "考試進度")} ${scheduleActionText}`}
          onClick={() => {
            if (!onOpenScheduleSettings) return;
            onOpenScheduleSettings();
          }}
        >
          <Tile className={styles.progressCard}>
          <div className={styles.progressHeader}>
            <div className={styles.progressTitleRow}>
              <Time size={16} className={styles.widgetIcon} />
              <h3 className={styles.widgetTitle}>{t("adminOverview.widgets.examProgress", "考試進度")}</h3>
            </div>
            <span className={styles.progressPercent}>
              {!hasSchedule
                ? t("adminOverview.time.unset", "未設定")
                : liveTimeProgress.isEnded
                  ? t("adminOverview.time.ended", "已結束")
                  : !liveTimeProgress.isStarted
                    ? t("adminOverview.time.notStarted", "尚未開始")
                    : t("adminOverview.widgets.gradingRunning", "進行中")}
            </span>
          </div>

          {hasSchedule && liveTimeProgress.isEnded ? (
            <div className={styles.ticketRow}>
              <div className={styles.ticketStop}>
                <span className={styles.ticketLabel}>{t("adminOverview.time.start", "開始")}</span>
                <span className={styles.ticketValue}>{startTimeLabel}</span>
              </div>
              <span className={styles.ticketArrow} aria-hidden>→</span>
              <div className={styles.ticketStop}>
                <span className={styles.ticketLabel}>{t("adminOverview.time.end", "結束")}</span>
                <span className={styles.ticketValue}>{endTimeLabel}</span>
              </div>
            </div>
          ) : (
            <>
              <div className={styles.progressPrimaryRow}>
                <div className={styles.progressValue}>
                  {!hasSchedule
                    ? t("adminOverview.time.configure", "設定時間")
                    : !liveTimeProgress.isStarted
                      ? formatDuration(countdownSeconds)
                      : formatDuration(liveTimeProgress.remainingSeconds)}
                  {hasSchedule && (
                    <span className={styles.widgetUnit}>
                      {!liveTimeProgress.isStarted
                        ? t("adminOverview.time.untilStartShort", "後開始")
                        : t("adminOverview.time.untilEndShort", "後結束")}
                    </span>
                  )}
                </div>
              </div>
              <ProgressBar
                className={styles.progressBar}
                hideLabel
                label={t("adminOverview.widgets.examProgress", "考試進度")}
                size="small"
                value={!hasSchedule ? 0 : !liveTimeProgress.isStarted ? countdownProgress : liveTimeProgress.progressPercent}
              />
            </>
          )}

          <div className={styles.progressFooter}>
            <div className={styles.progressStatusText}>
              {!hasSchedule ? (
                t("adminOverview.time.unscheduledHint", "尚未排程，請先發布並設定時段")
              ) : liveTimeProgress.isEnded ? (
                ""
              ) : (
                <>
                  {startTimeLabel}
                  <span className={styles.progressWindowSep}>{" — "}</span>
                  {endTimeLabel}
                </>
              )}
            </div>
            <div className={styles.progressActionRow}>
              <span>{scheduleActionText}</span>
              <span className={styles.progressActionIcon}>
                <Calendar size={16} />
              </span>
            </div>
          </div>
          </Tile>
        </button>

        {isDraftMode && (
          <ActionWidgetCard
            title={t("adminOverview.widgets.passwordRequired", "密碼保護")}
            icon={Locked}
            actionIcon={Security}
            actionIntent="toggle"
            active={contest.requiresPassword}
            value={contest.requiresPassword
              ? t("adminOverview.widgets.enabled", "已啟用")
              : t("adminOverview.widgets.disabled", "未啟用")}
            valueColor={contest.requiresPassword ? enabledColor : disabledColor}
            dangerBorder={!contest.requiresPassword}
            cta={contest.requiresPassword
              ? t("adminOverview.actions.disablePassword", "停用密碼")
              : t("adminOverview.actions.enablePassword", "啟用密碼")}
            onClick={() => {
              if (!canEditContest || !onRequestTogglePassword) return;
              void onRequestTogglePassword();
            }}
          />
        )}

        {isDraftMode && (
          <ActionWidgetCard
            title={t("adminOverview.draftChecklist.todoCountTitle", "發佈代辦事件數量")}
            icon={CheckmarkOutline}
            actionIcon={Edit}
            actionIntent="navigate"
            value={publishTodoCount}
            unit={t("adminOverview.kpi.caseUnit", "次")}
            valueColor={publishTodoCount > 0 ? draftColor : enabledColor}
            cta={t("adminOverview.draftChecklist.actions.open", "檢視代辦")}
            onClick={() => {
              if (!onOpenChecklist) return;
              onOpenChecklist();
            }}
          />
        )}

      </div>
    </section>
  );
}
