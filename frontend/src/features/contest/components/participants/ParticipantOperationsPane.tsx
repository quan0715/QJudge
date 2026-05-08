import {
  Button,
  InlineNotification,
  MenuButton,
  MenuItem,
  MenuItemDivider,
  SkeletonText,
} from "@carbon/react";
import {
  Calendar,
  DocumentTasks,
  Download,
  Edit,
  Launch,
  Locked,
  Login,
  ArrowRight,
  Renew,
  SendAlt,
  TrashCan,
  UserMultiple,
  WarningAlt,
  View,
} from "@carbon/icons-react";
import { useTranslation } from "react-i18next";

import type {
  ContestParticipant,
  ParticipantDashboard,
  ParticipantDashboardDetail,
} from "@/core/entities/contest.entity";
import { EmptyState } from "@/shared/ui/EmptyState";

import styles from "./ContestParticipantsDashboard.module.scss";

interface ParticipantOperationsPaneProps {
  dashboard: ParticipantDashboard | null;
  loading: boolean;
  error: string;
  onDownloadReport: () => void;
  onEditStatus: () => void;
  onUnlock: () => void;
  onReopenExam: () => void;
  onResetAttendance?: () => void;
  onRemoveParticipant?: () => void;
  onOpenDetail: (detail: ParticipantDashboardDetail) => void;
  onOpenGrading: () => void;
  onOpenProctoring: () => void;
  showViolationKpi?: boolean;
}

const getProfileDisplayName = (participant: ContestParticipant) =>
  participant.displayName ||
  participant.username;

const formatClockTime = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "-"
    : date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
};

const ParticipantOperationsPane = ({
  dashboard,
  loading,
  error,
  onDownloadReport,
  onEditStatus,
  onUnlock,
  onReopenExam,
  onResetAttendance,
  onRemoveParticipant,
  onOpenDetail,
  onOpenGrading,
  onOpenProctoring,
  showViolationKpi = false,
}: ParticipantOperationsPaneProps) => {
  const { t } = useTranslation("contest");

  if (!dashboard && !loading && !error) {
    return (
      <div className={styles.operationsPane}>
        <EmptyState
          title={t("dashboard.selectParticipantTitle", "選擇參賽者")}
          description={t(
            "dashboard.selectParticipantDescription",
            "從左側列表選擇一位參賽者，查看考試狀態與可執行操作。",
          )}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className={styles.operationsPane}>
        <div className={styles.operationsSkeleton}>
          <SkeletonText heading width="40%" />
          <SkeletonText width="56%" />
          <div className={styles.operationsMetricGrid}>
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className={styles.operationsSkeletonCard}>
                <SkeletonText width="48%" />
                <SkeletonText heading width="64%" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className={styles.operationsPane}>
        <InlineNotification
          kind="error"
          lowContrast
          title={t("dashboard.loadFailed", "載入參賽者 dashboard 失敗")}
          subtitle={error}
        />
      </div>
    );
  }

  const participant = dashboard.participant;
  const profileDisplayName = getProfileDisplayName(participant);
  const primaryAction = dashboard.actions.canUnlock
    ? {
        label: t("participants.actions.unlock", "解除鎖定"),
        icon: Locked,
        onClick: onUnlock,
      }
    : dashboard.actions.canReopenExam
      ? {
          label: t("participants.actions.reopen", "重新開放考試"),
          icon: DocumentTasks,
          onClick: onReopenExam,
        }
      : null;

  const scoreValue = `${dashboard.overview.totalScore} / ${dashboard.overview.maxScore}`;
  const accuracyValue =
    dashboard.overview.correctRate ?? dashboard.overview.acceptedRate ?? null;
  const gradingProgressValue =
    dashboard.contestType === "paper_exam"
      ? `${dashboard.overview.gradedCount ?? 0} / ${dashboard.overview.totalQuestions ?? 0}`
      : `${dashboard.overview.solved ?? 0} / ${dashboard.overview.totalProblems ?? 0}`;
  const examStatusRows = [
    {
      icon: DocumentTasks,
      label: t("dashboard.score", "分數"),
      value: `${scoreValue} ${t("dashboard.pointsUnit", "分")}`,
    },
    {
      icon: UserMultiple,
      label: t("dashboard.correctRate", "正確率"),
      value: accuracyValue != null ? `${accuracyValue}%` : "-",
    },
    {
      icon: DocumentTasks,
      label: t("dashboard.gradingProgress", "批改進度"),
      value: `${gradingProgressValue} ${t("dashboard.questionUnit", "題")}`,
    },
    ...(showViolationKpi
      ? [
          {
            icon: WarningAlt,
            label: t("dashboard.violations", "違規次數"),
            value: `${participant.violationCount} ${t("dashboard.countUnit", "次")}`,
            tone: participant.violationCount > 0 ? "danger" : undefined,
          },
        ]
      : []),
  ];

  const statusRows = [
    {
      icon: Login,
      label: t("dashboard.examConnection", "考試連線"),
      value: participant.lastHeartbeatAt
        ? t("participants.connection.online", "在線")
        : t("participants.connection.offline", "離線"),
      tone: participant.lastHeartbeatAt ? "success" : "muted",
    },
    {
      icon: View,
      label: t("dashboard.liveMonitoringSignal", "即時監看"),
      value: participant.liveMonitoringOnline
        ? t("participants.connection.live", "Live")
        : t("participants.connection.offline", "離線"),
      tone: participant.liveMonitoringOnline ? "success" : "muted",
    },
    {
      icon: View,
      label: t("dashboard.screenShareSignal", "螢幕分享"),
      value: participant.liveMonitoringSources?.includes("screen_share")
        ? t("dashboard.signalConnected", "已連線")
        : t("dashboard.signalMissing", "未偵測"),
      tone: participant.liveMonitoringSources?.includes("screen_share")
        ? "success"
        : "muted",
    },
    {
      icon: UserMultiple,
      label: t("dashboard.webcamSignal", "Webcam"),
      value: participant.liveMonitoringSources?.includes("webcam")
        ? t("dashboard.signalConnected", "已連線")
        : t("dashboard.signalMissing", "未偵測"),
      tone: participant.liveMonitoringSources?.includes("webcam")
        ? "success"
        : "muted",
    },
  ];
  const startedAtLabel = formatClockTime(participant.startedAt);
  const endedAtLabel = participant.leftAt
    ? formatClockTime(participant.leftAt)
    : t("dashboard.inProgress", "進行中");
  const answerStatusLabel = participant.examStatus
    ? t(`examStatus.${participant.examStatus}`, participant.examStatus)
    : "-";

  return (
    <div className={styles.operationsPane}>
      {error ? (
        <InlineNotification
          kind="warning"
          lowContrast
          title={t("dashboard.partialLoadWarning", "部分資料可能不是最新")}
          subtitle={error}
        />
      ) : null}

      <section className={styles.operationsHero}>
        <div className={styles.operationsHeroTop}>
          <div className={styles.operationsIdentity}>
            <div className={styles.operationsTitleRow}>
              <h2 className={styles.operationsTitle}>
                {profileDisplayName}
              </h2>
            </div>
            <p className={styles.operationsSubtitle}>@{participant.username}</p>
          </div>
        </div>
        {participant.lockReason ? (
          <p className={styles.operationsNotice}>
            {t("participants.headers.lockReason", "鎖定原因")}：
            {participant.lockReason}
          </p>
        ) : null}
        <div className={styles.operationsActions}>
          {primaryAction ? (
            <Button
              kind="primary"
              size="md"
              renderIcon={primaryAction.icon}
              onClick={primaryAction.onClick}
            >
              {primaryAction.label}
            </Button>
          ) : null}
          <MenuButton
            kind="tertiary"
            size="md"
            label={t("dashboard.moreActions", "更多操作")}
            menuAlignment="bottom-end"
          >
            <MenuItem
              label={t("participants.actions.edit", "編輯狀態")}
              renderIcon={Edit}
              onClick={onEditStatus}
            />
            <MenuItem
              label={t("participants.actions.download", "下載報告")}
              renderIcon={Download}
              onClick={onDownloadReport}
            />
            {dashboard.actions.canOpenGrading ? (
              <MenuItem
                label={t("dashboard.openGrading", "前往批改")}
                renderIcon={Launch}
                onClick={onOpenGrading}
              />
            ) : null}
            {onResetAttendance ? (
              <>
                <MenuItemDivider />
                <MenuItem
                  label={t("participants.actions.resetAttendance", "重置簽到測試紀錄")}
                  renderIcon={Renew}
                  onClick={onResetAttendance}
                />
              </>
            ) : null}
            {onRemoveParticipant ? (
              <>
                <MenuItemDivider />
                <MenuItem
                  kind="danger"
                  label={t("participants.actions.remove", "移除參賽者")}
                  renderIcon={TrashCan}
                  onClick={onRemoveParticipant}
                />
              </>
            ) : null}
          </MenuButton>
        </div>
      </section>

      <section className={styles.operationsSection}>
        <div className={styles.operationsSectionHeader}>
          <h3>{t("dashboard.quickNavigation", "快速前往")}</h3>
        </div>
        <div className={styles.operationsLinkGrid}>
          <Button
            kind="tertiary"
            size="md"
            renderIcon={View}
            className={styles.operationsNavButton}
            onClick={onOpenProctoring}
          >
            {t("dashboard.viewProctoring", "查看監控")}
          </Button>
          <Button
            kind="tertiary"
            size="md"
            renderIcon={Calendar}
            className={styles.operationsNavButton}
            onClick={() => onOpenDetail("events")}
          >
            {t("dashboard.viewEvents", "查看事件紀錄")}
          </Button>
          <Button
            kind="tertiary"
            size="md"
            renderIcon={DocumentTasks}
            className={styles.operationsNavButton}
            onClick={() => onOpenDetail("report")}
          >
            {t("dashboard.viewReport", "查看作答詳情")}
          </Button>
          {dashboard.contestType === "coding" ? (
            <Button
              kind="tertiary"
              size="md"
              renderIcon={SendAlt}
              className={styles.operationsNavButton}
              onClick={() => onOpenDetail("submissions")}
            >
              {t("dashboard.viewSubmissions", "查看提交")}
            </Button>
          ) : null}
        </div>
      </section>

      <section className={styles.operationsSection}>
        <div className={styles.operationsSectionHeader}>
          <h3>{t("dashboard.answerStatus", "作答狀態")}</h3>
        </div>
        <div className={styles.operationsAnswerStatusCard}>
          <div className={styles.operationsAnswerStatusSummary}>
            <span>{t("dashboard.currentAnswerStatus", "目前狀態")}</span>
            <strong>{answerStatusLabel}</strong>
          </div>
          <div className={styles.operationsTimeCard}>
            <div className={styles.operationsTimePoint}>
              <span>{t("dashboard.startedAt", "開始作答")}</span>
              <strong>{startedAtLabel}</strong>
            </div>
            <div className={styles.operationsTimeArrow} aria-hidden="true">
              <ArrowRight size={20} />
            </div>
            <div className={styles.operationsTimePoint}>
              <span>{t("dashboard.endedAt", "結束作答")}</span>
              <strong>{endedAtLabel}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.operationsSection}>
        <div className={styles.operationsSectionHeader}>
          <h3>{t("dashboard.liveStatus", "即時狀態")}</h3>
        </div>
        <div className={styles.operationsStatusList}>
          {statusRows.map(({ icon: Icon, label, value, tone }) => (
            <div key={label} className={styles.operationsStatusRow}>
              <div className={styles.operationsStatusIcon}>
                <Icon size={16} />
              </div>
              <div className={styles.operationsStatusText}>
                <span>{label}</span>
                <span className={styles.operationsStatusValueRow}>
                  <span
                    aria-hidden="true"
                    className={`${styles.operationsStatusDot} ${
                      tone === "success"
                        ? styles.operationsStatusDotLive
                        : tone === "muted"
                          ? styles.operationsStatusDotMuted
                          : ""
                    }`}
                  />
                  <strong
                    className={
                      tone === "success"
                        ? styles.operationsStatusSuccess
                        : tone === "muted"
                          ? styles.operationsStatusMuted
                          : undefined
                    }
                  >
                    {value}
                  </strong>
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.operationsSection}>
        <div className={styles.operationsSectionHeader}>
          <h3>{t("dashboard.examStatus", "考試狀態")}</h3>
        </div>
        <div
          className={styles.operationsStatusList}
          aria-label={t("dashboard.examStatus", "考試狀態")}
        >
          {examStatusRows.map(({ icon: Icon, label, value, tone }) => (
            <div key={label} className={styles.operationsStatusRow}>
              <div className={styles.operationsStatusIcon}>
                <Icon size={16} />
              </div>
              <div className={styles.operationsStatusText}>
                <span>{label}</span>
                <span className={styles.operationsStatusValueRow}>
                  <strong
                    className={
                      tone === "danger"
                        ? styles.operationsStatusDanger
                        : undefined
                    }
                  >
                    {value}
                  </strong>
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default ParticipantOperationsPane;
