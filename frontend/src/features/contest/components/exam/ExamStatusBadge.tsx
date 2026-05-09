import type { ExamStatusType } from "@/core/entities/contest.entity";
import { View, Locked, WarningAltFilled } from "@carbon/icons-react";
import { useExamMonitoringStatus } from "@/features/contest/contexts/ExamMonitoringStatusContext";
import { useTranslation } from "react-i18next";
import styles from "./ExamStatusBadge.module.scss";

interface ExamStatusBadgeProps {
  examStatus?: ExamStatusType;
  cheatDetectionEnabled?: boolean;
  timeLeft?: string | null;
  lockReason?: string;
  onClick?: () => void;
  hideWhenNormal?: boolean;
}

const ExamStatusBadge: React.FC<ExamStatusBadgeProps> = ({
  examStatus,
  cheatDetectionEnabled,
  timeLeft,
  lockReason,
  onClick,
  hideWhenNormal = false,
}) => {
  const { t } = useTranslation("contest");
  const monitoringReminder = useExamMonitoringStatus();

  const getMonitoringReminderLabel = (source: string) => {
    const defaultLabels: Record<string, string> = {
      screen_share: "螢幕分享中斷",
      webcam: "Webcam 中斷",
      split_view: "分割畫面",
      viewport: "視窗異常",
      fullscreen: "請回全螢幕",
      mouse_leave: "滑鼠離開",
      multiple_displays: "多螢幕",
      policy_unavailable: "監控需處理",
      pwa_required: "需用 PWA",
    };

    return t(`exam.monitoringReminder.${source}`, {
      defaultValue: defaultLabels[source] ?? t("exam.monitoring"),
    });
  };

  if (!cheatDetectionEnabled) return null;

  if (examStatus === "locked") {
    const title = `${lockReason || t("exam.lockedReason")}\n${t("exam.contactProctor")}`;
    return (
      <div title={title} className={styles.examStatusLocked}>
        <Locked size={16} />
        <span>{t("exam.locked")}</span>
      </div>
    );
  }

  if (examStatus === "paused") {
    return (
      <div title={t("exam.pausedHint")} className={styles.examStatusPaused}>
        <WarningAltFilled size={16} />
        <span>{t("exam.paused")}</span>
      </div>
    );
  }

  if (examStatus === "in_progress") {
    if (hideWhenNormal && !monitoringReminder) return null;

    const reminderLabel = monitoringReminder
      ? getMonitoringReminderLabel(monitoringReminder.source)
      : t("exam.monitoring");
    const reminderTitle = monitoringReminder
      ? t("exam.monitoringIssueHint", {
          defaultValue: "請依提示恢復監控狀態；系統已保留事件採證。",
        })
      : t("exam.monitoringHint");
    const reminderClassName =
      monitoringReminder?.tone === "critical"
        ? styles.examStatusCritical
        : monitoringReminder?.tone === "warning"
          ? styles.examStatusWarning
          : styles.examStatusInProgress;

    return (
      <div
        title={reminderTitle}
        onClick={onClick}
        className={reminderClassName}
        data-testid="exam-monitoring-status-badge"
      >
        {monitoringReminder ? (
          <WarningAltFilled size={16} />
        ) : (
          <View size={16} />
        )}
        <span>{reminderLabel}</span>
        {monitoringReminder?.countdownSeconds != null && (
          <span className={styles.examTimeDisplay}>
            {t("exam.monitoringCountdown", {
              defaultValue: "{{seconds}}s",
              seconds: monitoringReminder.countdownSeconds,
            })}
          </span>
        )}
        {timeLeft && <span className={styles.examTimeDisplay}>{timeLeft}</span>}
      </div>
    );
  }

  return null;
};

export default ExamStatusBadge;
